'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  tryInitCustomModel,
  classifyWithCustomModel,
  isCustomModelAvailable,
} from '@/lib/classifier/customModelClassifier';
import { classifyByFilename } from '@/lib/classifier/rules';
import type { ClassificationResult } from '@/lib/classifier/rules';

interface STLClassifierProps {
  url: string;
  onClassify?: (results: ClassificationResult[]) => void;
}

// ─────────────────────────────────────────────
// 1. 豆包 AI 文本兜底（文件名命中置信度不足时调用）
//    Key 只存在服务器 .env，浏览器请求走 /api/classify-doubao 中转
// ─────────────────────────────────────────────
const DOUBAO_MIN_CONFIDENCE = 0.7;

async function classifyWithDoubao(filename: string, filenameResults: ClassificationResult[]): Promise<ClassificationResult[] | null> {
  const top = filenameResults[0];
  if (top && top.probability >= DOUBAO_MIN_CONFIDENCE) return null;
  try {
    const res = await fetch('/api/classify-doubao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    const data = await res.json();
    if (data?.success && typeof data.category === 'string') {
      return [{ className: data.category, probability: 0.9 }];
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 2. MobileNet 输出 → 中文建筑类别映射
//    key: MobileNet 英文类名（小写，支持部分匹配）
//    value: 中文类别
// ─────────────────────────────────────────────
const MOBILENET_MAP: Array<{ pattern: string; label: string; score: number }> = [
  { pattern: 'pagoda',          label: '宝塔',   score: 1.0 },
  { pattern: 'stupa',           label: '宝塔',   score: 1.0 },
  { pattern: 'gazebo',          label: '亭子',   score: 1.0 },
  { pattern: 'pavilion',        label: '亭子',   score: 1.0 },
  { pattern: 'palace',          label: '大殿',   score: 0.9 },
  { pattern: 'castle',          label: '城楼',   score: 0.85 },
  { pattern: 'temple',          label: '庙宇',   score: 0.9 },
  { pattern: 'church',          label: '庙宇',   score: 0.7 },
  { pattern: 'monastery',       label: '寺院',   score: 0.9 },
  { pattern: 'mosque',          label: '庙宇',   score: 0.7 },
  { pattern: 'tower',           label: '塔',     score: 0.85 },
  { pattern: 'minaret',         label: '塔',     score: 0.9 },
  { pattern: 'bridge',          label: '桥',     score: 0.9 },
  { pattern: 'arch',            label: '牌坊',   score: 0.8 },
  { pattern: 'dome',            label: '大殿',   score: 0.7 },
  { pattern: 'fountain',        label: '园林',   score: 0.6 },
  { pattern: 'garden',          label: '园林',   score: 0.7 },
  { pattern: 'house',           label: '民居',   score: 0.7 },
  { pattern: 'cottage',         label: '民居',   score: 0.7 },
  { pattern: 'barn',            label: '民居',   score: 0.6 },
  { pattern: 'dragon',          label: '龙',     score: 1.0 },
  { pattern: 'lion',            label: '石狮',   score: 0.9 },
  { pattern: 'statue',          label: '雕塑',   score: 0.8 },
  { pattern: 'sculpture',       label: '雕塑',   score: 0.8 },
  { pattern: 'roof',            label: '飞檐',   score: 0.7 },
  { pattern: 'tile',            label: '古建筑', score: 0.6 },
  { pattern: 'wall',            label: '古建筑', score: 0.5 },
  { pattern: 'lighthouse',      label: '塔',     score: 0.7 },
  { pattern: 'obelisk',         label: '塔',     score: 0.7 },
  { pattern: 'totem',           label: '雕塑',   score: 0.7 },
  { pattern: 'column',          label: '古建筑', score: 0.6 },
  { pattern: 'pillar',          label: '古建筑', score: 0.6 },
];

// ─────────────────────────────────────────────
// 4. MobileNet 输出 → 建筑类别映射
// ─────────────────────────────────────────────
function mapMobileNetToArchitecture(mobilenetClass: string, probability: number): { label: string; score: number } | null {
  const lower = mobilenetClass.toLowerCase();
  for (const entry of MOBILENET_MAP) {
    if (lower.includes(entry.pattern)) {
      return { label: entry.label, score: probability * entry.score };
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// 5. 合并文件名分类 + MobileNet 分类
// ─────────────────────────────────────────────
function mergeClassifications(
  filenameResults: ClassificationResult[],
  aiResults: ClassificationResult[]
): ClassificationResult[] {
  const scores = new Map<string, number>();

  // 文件名分类权重 0.6（精确但依赖命名）
  for (const r of filenameResults) {
    scores.set(r.className, (scores.get(r.className) || 0) + r.probability * 0.6);
  }

  // AI 分类权重 0.4（泛化但不精确）
  for (const r of aiResults) {
    scores.set(r.className, (scores.get(r.className) || 0) + r.probability * 0.4);
  }

  return Array.from(scores.entries())
    .map(([className, probability]) => ({
      className,
      probability: Math.min(probability, 1.0),
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
}

// ── 分类模式 ─────────────────────────────────
/**
 * fast 模式：文件名规则 + MobileNet（当前默认）
 * custom 模式：仅使用训练器导出的专用模型
 * hybrid 模式：文件名规则 + MobileNet + 专用模型加权融合（默认）
 */
type ClassifierMode = 'fast' | 'custom' | 'hybrid';

// ─────────────────────────────────────────────
// 5b. 三路融合（fast + custom 混合）
//     hybrid 模式使用此函数
// ─────────────────────────────────────────────
/**
 * mergeHybridClassifications
 *
 * 三路加权融合：
 * - 如果 customResults 有结果：
 *   custom 权重 0.7, filename 权重 0.2, mobilenet 权重 0.1
 * - 如果 customResults 为空（专用模型未加载/预测失败）：
 *   沿用 fast 融合：filename 权重 0.6, mobilenet 权重 0.4
 *
 * 输出前 5 个结果，概率不超过 1.0。
 */
function mergeHybridClassifications(
  filenameResults: ClassificationResult[],
  mobilenetResults: ClassificationResult[],
  customResults: ClassificationResult[]
): ClassificationResult[] {
  const scores = new Map<string, number>();

  if (customResults.length > 0) {
    // hybrid：custom 主导
    for (const r of filenameResults) {
      scores.set(r.className, (scores.get(r.className) || 0) + r.probability * 0.2);
    }
    for (const r of mobilenetResults) {
      scores.set(r.className, (scores.get(r.className) || 0) + r.probability * 0.1);
    }
    for (const r of customResults) {
      scores.set(r.className, (scores.get(r.className) || 0) + r.probability * 0.7);
    }
  } else {
    // fallback：fast 融合（原逻辑）
    for (const r of filenameResults) {
      scores.set(r.className, (scores.get(r.className) || 0) + r.probability * 0.6);
    }
    for (const r of mobilenetResults) {
      scores.set(r.className, (scores.get(r.className) || 0) + r.probability * 0.4);
    }
  }

  return Array.from(scores.entries())
    .map(([className, probability]) => ({
      className,
      probability: Math.min(probability, 1.0),
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
}

// ─────────────────────────────────────────────
// 6. TensorFlow.js 初始化（带超时 + 多后端降级）
// ─────────────────────────────────────────────
interface TFType {
  setBackend: (name: string) => Promise<boolean>;
  ready: () => Promise<void>;
  getBackend: () => string;
}

interface MobileNetType {
  classify: (img: HTMLImageElement, topK: number) => Promise<Array<{ className: string; probability: number }>>;
}

let tfInstance: TFType | null = null;
let mobilenetInstance: MobileNetType | null = null;
let tfInitializing = false;
let tfInitFailed = false;

async function tryInitTensorFlow(): Promise<{ tf: TFType; mobilenet: MobileNetType } | null> {
  if (tfInitFailed) return null;
  if (tfInstance && mobilenetInstance) return { tf: tfInstance, mobilenet: mobilenetInstance };
  if (tfInitializing) {
    await new Promise(r => setTimeout(r, 300));
    return tryInitTensorFlow();
  }

  tfInitializing = true;
  try {
    const tf = await import('@tensorflow/tfjs');
    const mobilenet = await import('@tensorflow-models/mobilenet');

    // 依次尝试后端
    for (const backend of ['webgl', 'wasm', 'cpu']) {
      try {
        await tf.setBackend(backend);
        await tf.ready();
        console.log('[STLClassifier] TF backend:', tf.getBackend());
        break;
      } catch { /* 继续尝试下一个 */ }
    }

    const model = await Promise.race([
      mobilenet.load({ version: 2, alpha: 1.0 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Model load timeout (15s)')), 15000)
      ),
    ]);

    tfInstance = tf as unknown as TFType;
    mobilenetInstance = model as unknown as MobileNetType;
    tfInitializing = false;
    console.log('[STLClassifier] MobileNet ready');
    return { tf, mobilenet: model };
  } catch (err) {
    tfInitializing = false;
    tfInitFailed = true;
    console.warn('[STLClassifier] TF init failed, fallback to filename:', err);
    return null;
  }
}

// ─────────────────────────────────────────────
// 7. STL → 多角度图像
// ─────────────────────────────────────────────
function renderSTLToImages(stlUrl: string, canvas: HTMLCanvasElement): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const loader = new STLLoader();
    loader.load(
      stlUrl,
      (geometry) => {
        canvas.width = 224;
        canvas.height = 224;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(224, 224);
        renderer.setClearColor(0x1e1e2e);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e1e2e);

        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const d1 = new THREE.DirectionalLight(0xffffff, 1.2);
        d1.position.set(1, 2, 1.5);
        scene.add(d1);
        const d2 = new THREE.DirectionalLight(0x8888ff, 0.4);
        d2.position.set(-1, -1, -1);
        scene.add(d2);

        const material = new THREE.MeshPhongMaterial({
          color: 0x4fc3f7,
          specular: 0x333333,
          shininess: 80,
          flatShading: false,
        });
        const mesh = new THREE.Mesh(geometry, material);

        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        const center = new THREE.Vector3();
        box.getCenter(center);
        mesh.position.sub(center);

        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 60 / maxDim;
        mesh.scale.set(scale, scale, scale);
        scene.add(mesh);

        // 8 个角度：正面/背面/左/右/顶/底 + 两个等轴
        const dist = 120;
        const angles = [
          [0, 0, dist],          // 正面
          [0, 0, -dist],         // 背面
          [dist, 0, 0],          // 右侧
          [-dist, 0, 0],         // 左侧
          [0, dist, 0],          // 顶部
          [dist * 0.7, dist * 0.7, dist * 0.7],   // 等轴1
          [-dist * 0.7, dist * 0.7, dist * 0.7],  // 等轴2
          [dist * 0.7, dist * 0.7, -dist * 0.7],  // 等轴3
        ];

        const images: string[] = [];
        for (const [x, y, z] of angles) {
          camera.position.set(x, y, z);
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
          images.push(canvas.toDataURL('image/jpeg', 0.9));
        }

        renderer.dispose();
        geometry.dispose();
        material.dispose();
        resolve(images);
      },
      undefined,
      reject
    );
  });
}

// ─────────────────────────────────────────────
// 8. React 组件
// ─────────────────────────────────────────────
export function STLClassifier({ url, onClassify }: STLClassifierProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [classifierMode, setClassifierMode] = useState<ClassifierMode>('fast');
  const [customModelAvailable, setCustomModelAvailable] = useState(false);

  // 启动时尝试加载专用模型
  useEffect(() => {
    setIsClient(true);
    (async () => {
      const ok = await tryInitCustomModel();
      setCustomModelAvailable(ok);
      setClassifierMode(ok ? 'hybrid' : 'fast');
      if (ok) {
        console.log('[STLClassifier] 专用古建筑分类模型已加载，使用 hybrid 模式');
      } else {
        console.log('[STLClassifier] 未检测到专用模型，使用 fast 模式');
      }
    })();
  }, []);

  const handleClassify = async () => {
    if (!url || !isClient || !canvasRef.current) return;

    setLoading(true);
    setResults([]);
    setUsingFallback(false);

    try {
      // 文件名分类（始终执行）
      const filename = decodeURIComponent(url.split('/').pop() || 'unknown')
        .replace(/\.stl$/i, '');
      const filenameResults = classifyByFilename(filename);

      // 豆包 AI 兜底：文件名命中且置信度达标则直接用规则结果；
      // 未命中或置信度不足时调豆包文本分类，成功则跳过重量级 TF 流程
      setStatus('AI 兜底分析中…');
      const doubaoResults = await classifyWithDoubao(filename, filenameResults);
      if (doubaoResults) {
        setResults(doubaoResults);
        if (onClassify) onClassify(doubaoResults);
        setStatus('分类完成（豆包 AI）');
        return;
      }

      // 尝试 AI 分类（MobileNet + 可选专用模型）
      setStatus('初始化 AI...');
      const tfResult = await tryInitTensorFlow();

      if (tfResult) {
        setStatus('渲染模型...');
        const isBlob = url.includes('blob.vercel-storage.com');
        const fetchUrl = isBlob ? `/api/get-blob?url=${encodeURIComponent(url)}` : url;

        try {
          const images = await renderSTLToImages(fetchUrl, canvasRef.current);
          setStatus(`分析 ${images.length} 个视角...`);

          // MobileNet 分类
          const aiScores = new Map<string, number>();
          for (let i = 0; i < images.length; i++) {
            setStatus(`AI 分析 ${i + 1}/${images.length}...`);
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); img.src = images[i]; });
            if (img.width > 0) {
              try {
                const preds = await tfResult.mobilenet.classify(img, 10);
                for (const p of preds) {
                  const mapped = mapMobileNetToArchitecture(p.className, p.probability);
                  if (mapped) {
                    aiScores.set(mapped.label, (aiScores.get(mapped.label) || 0) + mapped.score);
                  }
                }
              } catch { /* 忽略单张失败 */ }
            }
          }

          const aiResults = Array.from(aiScores.entries())
            .map(([className, probability]) => ({ className, probability: probability / images.length }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5);

          // 专用模型分类（custom / hybrid 模式）
          let customResults: ClassificationResult[] = [];
          if (customModelAvailable) {
            setStatus('专用模型分析中...');
            customResults = await classifyWithCustomModel(images);
          }

          // 根据分类模式选择融合策略
          let merged: ClassificationResult[];
          if (customModelAvailable) {
            // hybrid 模式：三路融合
            merged = mergeHybridClassifications(filenameResults, aiResults, customResults);
            setStatus('混合分类完成');
          } else {
            // fast 模式：原双路融合
            merged = mergeClassifications(filenameResults, aiResults);
            setStatus('分类完成');
          }

          setResults(merged);
          if (onClassify) onClassify(merged);
        } catch {
          // 渲染失败，退回文件名分类
          setResults(filenameResults);
          setUsingFallback(true);
          if (onClassify) onClassify(filenameResults);
          setStatus('分类完成（备用模式）');
        }
      } else {
        setUsingFallback(true);
        setResults(filenameResults);
        if (onClassify) onClassify(filenameResults);
        setStatus('分类完成（文件名模式）');
      }
    } catch (err) {
      console.error('[STLClassifier]', err);
      const filename = decodeURIComponent(url.split('/').pop() || 'unknown').replace(/\.stl$/i, '');
      const fallback = classifyByFilename(filename);
      setResults(fallback);
      setUsingFallback(true);
      if (onClassify) onClassify(fallback);
      setStatus('分类完成（备用模式）');
    } finally {
      setLoading(false);
    }
  };

  if (!isClient) return null;

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="hidden" />

      <button
        onClick={handleClassify}
        disabled={loading || !url}
        className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="truncate">{status || '分类中...'}</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            🧠 AI 智能分类
          </>
        )}
      </button>

      {/* 分类模式提示 */}
      {!loading && !usingFallback && isClient && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-1">
          {customModelAvailable
            ? '🧠 分类模式：混合分类（专用模型 + MobileNet + 规则）'
            : '💡 未检测到可用专用模型，使用快速分类模式'}
        </p>
      )}

      {usingFallback && !loading && results.length > 0 && (
        <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          💡 使用文件名分类（AI 模型未加载）
        </p>
      )}

      {results.length > 0 && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-xs font-semibold text-purple-700 mb-2">🎯 分类结果</p>
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-700 w-20 shrink-0 truncate" title={r.className}>
                  {i === 0 ? '🏆 ' : '　'}{r.className}
                </span>
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${Math.min(r.probability * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-8 text-right shrink-0">
                  {Math.min(r.probability * 100, 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 9. 批量分类工具函数（供 page.tsx 调用）
//     自动使用 hybrid 或 fast 模式
// ─────────────────────────────────────────────
export async function classifySTLModel(url: string): Promise<ClassificationResult[]> {
  if (typeof window === 'undefined') throw new Error('仅限浏览器环境');

  // 1. 文件名分类（始终优先）
  const filename = decodeURIComponent(url.split('/').pop() || 'unknown').replace(/\.stl$/i, '');
  const filenameResults = classifyByFilename(filename);

  // 1b. 豆包 AI 兜底：未命中或置信度不足时尝试文本分类
  try {
    const doubaoResults = await classifyWithDoubao(filename, filenameResults);
    if (doubaoResults) return doubaoResults;
  } catch { /* 忽略，走原有流程 */ }

  // 2. 尝试 AI 分类
  const tfResult = await tryInitTensorFlow();
  if (!tfResult) return filenameResults;

  try {
    // 3. 渲染 STL 多视角图像
    const canvas = document.createElement('canvas');
    const images = await renderSTLToImages(url, canvas);

    // 4. MobileNet 分类
    const aiScores = new Map<string, number>();
    for (const imgData of images) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); img.src = imgData; });
      if (img.width > 0) {
        try {
          const preds = await tfResult.mobilenet.classify(img, 10);
          for (const p of preds) {
            const mapped = mapMobileNetToArchitecture(p.className, p.probability);
            if (mapped) {
              aiScores.set(mapped.label, (aiScores.get(mapped.label) || 0) + mapped.score);
            }
          }
        } catch { /* 忽略 */ }
      }
    }

    const aiResults = Array.from(aiScores.entries())
      .map(([className, probability]) => ({ className, probability: probability / images.length }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    // 5. 尝试专用模型分类（如可用）
    let customResults: ClassificationResult[] = [];
    try {
      const customOk = await tryInitCustomModel();
      if (customOk) {
        customResults = await classifyWithCustomModel(images);
      }
    } catch { /* 专用模型失败不中断 */ }

    // 6. 融合
    if (customResults.length > 0) {
      return mergeHybridClassifications(filenameResults, aiResults, customResults);
    }
    return mergeClassifications(filenameResults, aiResults);
  } catch {
    // 任意环节失败都 fallback 到文件名分类
    return filenameResults;
  }
}
