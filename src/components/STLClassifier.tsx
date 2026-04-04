'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

interface ClassificationResult {
  className: string;
  probability: number;
}

interface STLClassifierProps {
  url: string;
  onClassify?: (results: ClassificationResult[]) => void;
}

// ─────────────────────────────────────────────
// 1. 分类规则：优先级从高到低排列
//    每条规则：{ label, keywords, weight }
//    keywords 中任意一个命中文件名即得分 weight
// ─────────────────────────────────────────────
interface Rule {
  label: string;
  keywords: string[];
  weight: number;
}

const RULES: Rule[] = [
  // ── 亭台楼阁（最高优先级，细分类型）──
  { label: '六角亭', keywords: ['六角亭','hexagonal pavilion','hexagonal gazebo','6-sided pavilion','liujiao'], weight: 1.0 },
  { label: '八角亭', keywords: ['八角亭','octagonal pavilion','octagonal gazebo','8-sided pavilion','bajiao'], weight: 1.0 },
  { label: '四角亭', keywords: ['四角亭','square pavilion','4-sided pavilion','sijiao'], weight: 1.0 },
  { label: '圆亭',   keywords: ['圆亭','round pavilion','circular pavilion','yuanting'], weight: 1.0 },
  { label: '廊亭',   keywords: ['廊亭','corridor pavilion','covered walkway pavilion'], weight: 1.0 },
  { label: '亭子',   keywords: ['亭子','亭台','凉亭','亭','pavilion','gazebo','kiosk','booth'], weight: 0.9 },
  { label: '楼阁',   keywords: ['楼阁','阁楼','阁','楼','loft','attic','storied building','tower house','lou','ge'], weight: 0.9 },
  { label: '台',     keywords: ['台','观星台','烽火台','点将台','拜月台','platform','terrace','stage platform'], weight: 0.85 },
  { label: '戏台',   keywords: ['戏台','古戏台','戏楼','opera stage','stage','xitai'], weight: 0.95 },
  { label: '廊',     keywords: ['廊','回廊','游廊','连廊','corridor','covered walkway','lang'], weight: 0.85 },

  // ── 塔（细分）──
  { label: '宝塔',   keywords: ['宝塔','佛塔','pagoda','stupa','buddhist tower','baota'], weight: 1.0 },
  { label: '木塔',   keywords: ['木塔','wooden tower','wooden pagoda','muta'], weight: 1.0 },
  { label: '砖塔',   keywords: ['砖塔','brick tower','brick pagoda','zhuanta'], weight: 1.0 },
  { label: '石塔',   keywords: ['石塔','stone tower','stone pagoda','shita'], weight: 1.0 },
  { label: '雁塔',   keywords: ['雁塔','大雁塔','小雁塔','wild goose pagoda','yanta'], weight: 1.0 },
  { label: '塔',     keywords: ['塔','tower','turret','minaret','spire'], weight: 0.85 },

  // ── 桥（细分）──
  { label: '廊桥',   keywords: ['廊桥','风雨桥','covered bridge','langqiao'], weight: 1.0 },
  { label: '石拱桥', keywords: ['石拱桥','拱桥','arch bridge','stone arch','shigongqiao'], weight: 1.0 },
  { label: '木桥',   keywords: ['木桥','wooden bridge','muqiao'], weight: 1.0 },
  { label: '索桥',   keywords: ['索桥','吊桥','suspension bridge','rope bridge','suoqiao'], weight: 1.0 },
  { label: '桥',     keywords: ['桥','bridge','viaduct','overpass','qiao'], weight: 0.85 },

  // ── 门楼牌坊（细分）──
  { label: '牌坊',   keywords: ['牌坊','牌楼','石牌坊','木牌坊','功德坊','archway','memorial arch','paifang','pailou'], weight: 1.0 },
  { label: '城门',   keywords: ['城门','城楼','gate tower','city gate','chengmen'], weight: 1.0 },
  { label: '门楼',   keywords: ['门楼','宅门','大门','gate','entrance gate','menlou'], weight: 0.9 },

  // ── 殿堂庙宇（细分）──
  { label: '大殿',   keywords: ['大殿','正殿','宫殿','金銮殿','大雄宝殿','main hall','palace hall','dadian'], weight: 1.0 },
  { label: '庙宇',   keywords: ['庙','寺庙','道观','文庙','城隍庙','土地庙','temple','shrine','taoist temple','miao'], weight: 0.9 },
  { label: '寺院',   keywords: ['寺','寺院','佛寺','禅寺','monastery','buddhist temple','si'], weight: 0.9 },
  { label: '祠堂',   keywords: ['祠','宗祠','祠堂','家祠','ancestral hall','clan hall','citang'], weight: 1.0 },

  // ── 民居院落（细分）──
  { label: '四合院', keywords: ['四合院','北京四合院','siheyuan','courtyard house','beijing courtyard'], weight: 1.0 },
  { label: '徽派民居', keywords: ['徽派','徽州','马头墙','天井','huizhou','huipai','horse head wall'], weight: 1.0 },
  { label: '客家土楼', keywords: ['土楼','客家','tulou','hakka','earthen building'], weight: 1.0 },
  { label: '吊脚楼', keywords: ['吊脚楼','苗族','侗族','stilted house','diaojiaolou'], weight: 1.0 },
  { label: '民居',   keywords: ['民居','民宅','住宅','古民居','traditional house','vernacular','minjv'], weight: 0.85 },

  // ── 园林景观 ──
  { label: '假山',   keywords: ['假山','太湖石','rockery','artificial mountain','jiashan'], weight: 1.0 },
  { label: '水榭',   keywords: ['水榭','水亭','waterside pavilion','shuixie'], weight: 1.0 },
  { label: '园林',   keywords: ['园林','花园','苏州园林','garden','classical garden','yuanlin'], weight: 0.85 },

  // ── 装饰构件 ──
  { label: '斗拱',   keywords: ['斗拱','dougong','bracket set','corbel bracket'], weight: 1.0 },
  { label: '飞檐',   keywords: ['飞檐','翘角','upturned eave','flying eave','feiyuan'], weight: 1.0 },
  { label: '榫卯',   keywords: ['榫卯','榫','卯','mortise','tenon','joinery','sunmao'], weight: 1.0 },
  { label: '龙',     keywords: ['龙','龙纹','龙雕','螭龙','dragon','loong'], weight: 0.95 },
  { label: '凤',     keywords: ['凤','凤凰','phoenix','fenghuang'], weight: 0.95 },
  { label: '石狮',   keywords: ['石狮','狮子','guardian lion','stone lion','shishi'], weight: 0.95 },
  { label: '雕塑',   keywords: ['雕塑','雕像','石雕','木雕','sculpture','statue','carving'], weight: 0.8 },

  // ── 通用建筑（兜底）──
  { label: '古建筑', keywords: ['古建筑','古建','中式建筑','传统建筑','ancient architecture','chinese architecture'], weight: 0.75 },
  { label: '建筑',   keywords: ['building','architecture','structure','edifice'], weight: 0.5 },
];

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
// 3. 文件名分类（基于规则表）
// ─────────────────────────────────────────────
function classifyByFilename(filename: string): ClassificationResult[] {
  const lower = filename.toLowerCase();
  const scores = new Map<string, number>();

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        const prev = scores.get(rule.label) || 0;
        scores.set(rule.label, Math.max(prev, rule.weight));
        break; // 同一规则只计一次
      }
    }
  }

  if (scores.size === 0) {
    return [{ className: '未分类', probability: 0.4 }];
  }

  return Array.from(scores.entries())
    .map(([className, probability]) => ({ className, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
}

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

// ─────────────────────────────────────────────
// 6. TensorFlow.js 初始化（带超时 + 多后端降级）
// ─────────────────────────────────────────────
let tfInstance: any = null;
let mobilenetInstance: any = null;
let tfInitializing = false;
let tfInitFailed = false;

async function tryInitTensorFlow(): Promise<{ tf: any; mobilenet: any } | null> {
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

    tfInstance = tf;
    mobilenetInstance = model;
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

  useEffect(() => { setIsClient(true); }, []);

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

      // 尝试 AI 分类
      setStatus('初始化 AI...');
      const tfResult = await tryInitTensorFlow();

      if (tfResult) {
        setStatus('渲染模型...');
        const isBlob = url.includes('blob.vercel-storage.com');
        const fetchUrl = isBlob ? `/api/get-blob?url=${encodeURIComponent(url)}` : url;

        try {
          const images = await renderSTLToImages(fetchUrl, canvasRef.current);
          setStatus(`分析 ${images.length} 个视角...`);

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

          const merged = mergeClassifications(filenameResults, aiResults);
          setResults(merged);
          if (onClassify) onClassify(merged);
        } catch {
          // 渲染失败，退回文件名分类
          setResults(filenameResults);
          setUsingFallback(true);
          if (onClassify) onClassify(filenameResults);
        }
      } else {
        setUsingFallback(true);
        setResults(filenameResults);
        if (onClassify) onClassify(filenameResults);
      }

      setStatus('分类完成');
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
// ─────────────────────────────────────────────
export async function classifySTLModel(url: string): Promise<ClassificationResult[]> {
  if (typeof window === 'undefined') throw new Error('仅限浏览器环境');

  const filename = decodeURIComponent(url.split('/').pop() || 'unknown').replace(/\.stl$/i, '');
  const filenameResults = classifyByFilename(filename);

  const tfResult = await tryInitTensorFlow();
  if (!tfResult) return filenameResults;

  try {
    const canvas = document.createElement('canvas');
    const images = await renderSTLToImages(url, canvas);

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

    return mergeClassifications(filenameResults, aiResults);
  } catch {
    return filenameResults;
  }
}
