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

// 全局状态
let tfInstance: any = null;
let mobilenetInstance: any = null;
let initializing = false;
let tfInitFailed = false;

// 古建筑相关关键词分类规则
const CLASSIFICATION_RULES: Record<string, string[]> = {
  '凉亭': ['凉亭', '亭子', 'pavilion', 'gazebo', 'pavilion', 'booth', 'kiosk'],
  '塔': ['塔', 'tower', 'pagoda', 'stupa', 'minaret', 'turret'],
  '桥': ['桥', 'bridge', 'arch', 'viaduct', 'overpass'],
  '龙': ['龙', 'dragon', '龙舟'],
  '狮子': ['狮子', 'lion', '石狮'],
  '雕像': ['雕像', 'statue', 'sculpture', 'figure', 'figurine'],
  '宫殿': ['宫殿', 'palace', 'castle'],
  '庙宇': ['庙', 'temple', 'church', 'shrine', 'mosque'],
  '房屋': ['屋', 'house', 'home', 'hut', 'cottage', 'cabin'],
  '船': ['船', 'ship', 'boat', 'vessel', 'ferry', 'cruise'],
  '飞机': ['飞机', 'plane', 'aircraft', 'jet', 'fighter'],
  '车': ['车', 'car', 'vehicle', 'automobile', 'truck', 'bus'],
  '动物': ['动物', 'animal', 'cat', 'dog', 'bird', 'fish', 'horse', 'bear', 'rabbit'],
  '玩具': ['toy', 'toy', 'game', 'puzzle'],
  '机械': ['gear', '机械', 'machine', 'engine', 'motor', 'robotic'],
  '工具': ['工具', 'tool', 'hammer', 'wrench', 'saw', 'drill'],
  '器具': ['瓶', '瓶', 'bottle', 'cup', 'mug', 'bowl', 'plate', 'vase'],
};

// TensorFlow.js 中文翻译映射
const TRANSLATIONS: Record<string, string> = {
  'palace': '宫殿', 'temple': '庙宇', 'church': '教堂', 'tower': '塔楼',
  'castle': '城堡', 'bridge': '桥', 'arch': '拱门/牌坊', 'dome': '圆顶',
  'gazebo': '凉亭', 'pavilion': '亭子', 'roof': '屋顶', 'dragon': '龙',
  'lion': '狮子', 'statue': '雕像', 'sculpture': '雕塑', 'fountain': '喷泉',
  'garden': '园林', 'courtyard': '庭院', 'building': '建筑', 'house': '房屋',
  'pagoda': '宝塔', 'stupa': '佛塔', 'monastery': '寺院',
  'ship': '船', 'boat': '船', 'aircraft': '飞机', 'car': '车',
  'animal': '动物', 'toy': '玩具', 'gear': '机械', 'tool': '工具',
};

function translate(name: string): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(TRANSLATIONS)) {
    if (lower.includes(k)) return v;
  }
  return name;
}

// 基于文件名的分类
function classifyByFilename(filename: string): ClassificationResult[] {
  const lowerFilename = filename.toLowerCase();
  const results: ClassificationResult[] = [];
  
  for (const [category, keywords] of Object.entries(CLASSIFICATION_RULES)) {
    for (const keyword of keywords) {
      if (lowerFilename.includes(keyword.toLowerCase())) {
        results.push({
          className: category,
          probability: 0.8, // 基于文件名匹配给出较高置信度
        });
        break;
      }
    }
  }
  
  // 如果没有匹配，返回"未分类"
  if (results.length === 0) {
    results.push({
      className: '未分类',
      probability: 0.5,
    });
  }
  
  // 去重并按概率排序
  const uniqueResults = results.reduce((acc, curr) => {
    const existing = acc.find(r => r.className === curr.className);
    if (!existing) {
      acc.push(curr);
    }
    return acc;
  }, [] as ClassificationResult[]);
  
  return uniqueResults.sort((a, b) => b.probability - a.probability).slice(0, 5);
}

// 尝试初始化 TensorFlow.js
async function tryInitTensorFlow(): Promise<{ tf: any; mobilenet: any } | null> {
  if (tfInitFailed) return null;
  if (tfInstance && mobilenetInstance) {
    return { tf: tfInstance, mobilenet: mobilenetInstance };
  }
  
  if (initializing) {
    await new Promise(r => setTimeout(r, 200));
    return tryInitTensorFlow();
  }
  
  initializing = true;
  
  try {
    const tf = await import('@tensorflow/tfjs');
    const mobilenet = await import('@tensorflow-models/mobilenet');
    
    console.log('[STLClassifier] Initializing TensorFlow.js...');
    
    // 尝试设置后端
    try {
      await tf.setBackend('webgl');
    } catch {
      try {
        await tf.setBackend('wasm');
      } catch {
        try {
          await tf.setBackend('cpu');
        } catch {
          // 所有后端都失败
        }
      }
    }
    
    await tf.ready();
    console.log('[STLClassifier] Backend:', tf.getBackend());
    
    // 尝试加载模型，设置较短超时
    const model = await Promise.race([
      mobilenet.load({ version: 2, alpha: 1.0 }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Model load timeout')), 10000)
      ),
    ]);
    
    tfInstance = tf;
    mobilenetInstance = model;
    initializing = false;
    
    console.log('[STLClassifier] Model ready!');
    return { tf, mobilenet: model };
  } catch (error) {
    initializing = false;
    tfInitFailed = true;
    console.warn('[STLClassifier] TensorFlow.js init failed, will use filename-based classification:', error);
    return null;
  }
}

export function STLClassifier({ url, onClassify }: STLClassifierProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 渲染 STL 为图像
  const renderSTLImages = useCallback(async (stlUrl: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const loader = new STLLoader();
      const images: string[] = [];
      
      loader.load(
        stlUrl,
        (geometry) => {
          if (!canvasRef.current) {
            reject(new Error('Canvas not ready'));
            return;
          }
          
          const canvas = canvasRef.current;
          canvas.width = 224;
          canvas.height = 224;
          
          const renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: true,
            preserveDrawingBuffer: true,
          });
          renderer.setSize(224, 224);
          renderer.setClearColor(0x2a2a2a);
          
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x2a2a2a);
          
          const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
          
          scene.add(new THREE.AmbientLight(0x606060, 2));
          
          const light1 = new THREE.DirectionalLight(0xffffff, 1);
          light1.position.set(1, 1, 1);
          scene.add(light1);
          
          const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
          light2.position.set(-1, -1, -1);
          scene.add(light2);
          
          const material = new THREE.MeshPhongMaterial({
            color: 0x00a8ff,
            specular: 0x222222,
            shininess: 150,
            flatShading: true,
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
          const scale = 45 / maxDim;
          mesh.scale.set(scale, scale, scale);
          
          scene.add(mesh);
          
          const angles = [
            [0, 0, 60], [40, 40, 40], [-40, 40, 40], [0, 60, 0], [60, 0, 0],
          ];
          
          for (const [x, y, z] of angles) {
            camera.position.set(x, y, z);
            camera.lookAt(0, 0, 0);
            renderer.render(scene, camera);
            images.push(canvas.toDataURL('image/jpeg', 0.85));
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
  }, []);

  // 执行分类
  const handleClassify = async () => {
    if (!url || !isClient) return;
    
    setLoading(true);
    setError(null);
    setResults([]);
    setUsingFallback(false);
    
    try {
      // 1. 尝试初始化 TensorFlow.js
      setStatus('检查 AI 模型...');
      const tfResult = await tryInitTensorFlow();
      
      // 2. 渲染 STL 图像
      setStatus('渲染 3D 模型...');
      const isPrivateBlob = url.includes('blob.vercel-storage.com');
      const fetchUrl = isPrivateBlob ? `/api/get-blob?url=${encodeURIComponent(url)}` : url;
      
      const images = await renderSTLImages(fetchUrl);
      
      // 3. 根据文件名提取分类
      const filename = url.split('/').pop() || url.split('/').pop() || 'unknown.stl';
      const filenameResults = classifyByFilename(filename.replace('.stl', '').replace('.STL', ''));
      
      // 4. 如果 TensorFlow.js 可用，进行 AI 分类
      if (tfResult) {
        setStatus(`已渲染 ${images.length} 个角度，AI 分析中...`);
        
        const predictions = new Map<string, number>();
        
        for (let i = 0; i < images.length; i++) {
          setStatus(`AI 分析 ${i + 1}/${images.length}...`);
          
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = images[i];
          });
          
          if (img.width > 0) {
            try {
              const preds = await tfResult.mobilenet.classify(img, 5);
              for (const p of preds) {
                const current = predictions.get(p.className) || 0;
                predictions.set(p.className, current + p.probability);
              }
            } catch (e) {
              console.warn('[STLClassifier] AI classification failed:', e);
            }
          }
        }
        
        // 合并 AI 结果
        if (predictions.size > 0) {
          const aiResults = Array.from(predictions.entries())
            .map(([className, probability]) => ({
              className: translate(className),
              probability: probability / images.length,
            }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 3);
          
          // 合并文件名分类和 AI 分类
          setResults(mergeResults(filenameResults, aiResults));
        } else {
          setResults(filenameResults);
        }
      } else {
        // 使用文件名分类
        setUsingFallback(true);
        setStatus('使用文件名分类...');
        setResults(filenameResults);
      }
      
      setStatus('分类完成！');
      
      if (onClassify) {
        onClassify(results.length > 0 ? results : filenameResults);
      }
    } catch (err) {
      console.error('[STLClassifier] Error:', err);
      // 发生错误时，使用文件名分类作为后备
      const filename = url.split('/').pop() || 'unknown';
      const fallbackResults = classifyByFilename(filename.replace('.stl', '').replace('.STL', ''));
      setResults(fallbackResults);
      setUsingFallback(true);
      setStatus('分类完成（备用模式）');
    } finally {
      setLoading(false);
    }
  };

  // 合并两种分类结果
  function mergeResults(filenameResults: ClassificationResult[], aiResults: ClassificationResult[]): ClassificationResult[] {
    const merged = new Map<string, ClassificationResult>();
    
    // 添加文件名分类结果
    for (const r of filenameResults) {
      merged.set(r.className, { ...r });
    }
    
    // 合并 AI 结果
    for (const r of aiResults) {
      const existing = merged.get(r.className);
      if (existing) {
        // 取两者的平均值，提高置信度
        existing.probability = (existing.probability + r.probability) / 2 * 1.2;
        if (existing.probability > 1) existing.probability = 1;
      } else {
        merged.set(r.className, { ...r });
      }
    }
    
    return Array.from(merged.values())
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);
  }

  if (!isClient) {
    return (
      <div className="p-3 bg-gray-100 rounded-lg text-sm text-gray-500">
        ⏳ 等待页面加载完成...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} className="hidden" />
      
      <button
        onClick={handleClassify}
        disabled={loading || !url}
        className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {status || '分类中...'}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            🧠 AI 智能分类
          </>
        )}
      </button>
      
      {usingFallback && !loading && results.length > 0 && (
        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          💡 当前使用文件名分类（AI 模型加载失败时可正常工作）
        </div>
      )}
      
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
          ⚠️ {error}
        </div>
      )}
      
      {results.length > 0 && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 className="font-medium text-purple-800 mb-2">
            🎯 分类结果 {usingFallback && <span className="text-xs font-normal">(文件名分类)</span>}
          </h4>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
                  {i === 0 && '🏆 '}{r.className}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 transition-all"
                      style={{ width: `${r.probability * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">
                    {(r.probability * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 批量分类工具函数
export async function classifySTLModel(url: string): Promise<ClassificationResult[]> {
  if (typeof window === 'undefined') {
    throw new Error('classifySTLModel 只能在浏览器中运行');
  }
  
  // 从 URL 提取文件名
  const filename = url.split('/').pop() || url.split('/').pop() || 'unknown.stl';
  const cleanFilename = filename.replace('.stl', '').replace('.STL', '');
  
  // 尝试 TensorFlow.js
  const tfResult = await tryInitTensorFlow();
  
  if (tfResult) {
    try {
      // 渲染图像
      const images = await new Promise<string[]>((resolve, reject) => {
        const loader = new STLLoader();
        const canvas = document.createElement('canvas');
        canvas.width = 224;
        canvas.height = 224;
        
        loader.load(
          url,
          (geometry) => {
            const renderer = new THREE.WebGLRenderer({ 
              canvas, 
              antialias: true,
              preserveDrawingBuffer: true,
            });
            renderer.setSize(224, 224);
            renderer.setClearColor(0x2a2a2a);
            
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x2a2a2a);
            
            const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
            
            scene.add(new THREE.AmbientLight(0x606060, 2));
            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(1, 1, 1);
            scene.add(light);
            
            const material = new THREE.MeshPhongMaterial({
              color: 0x00a8ff,
              specular: 0x222222,
              shininess: 150,
              flatShading: true,
            });
            const mesh = new THREE.Mesh(geometry, material);
            
            geometry.computeBoundingBox();
            const box = geometry.boundingBox!;
            const center = new THREE.Vector3();
            box.getCenter(center);
            mesh.position.sub(center);
            
            const size = new THREE.Vector3();
            box.getSize(size);
            const scale = 45 / Math.max(size.x, size.y, size.z);
            mesh.scale.set(scale, scale, scale);
            
            scene.add(mesh);
            
            const images: string[] = [];
            const angles = [[0, 0, 60], [40, 40, 40], [-40, 40, 40]];
            
            for (const [x, y, z] of angles) {
              camera.position.set(x, y, z);
              camera.lookAt(0, 0, 0);
              renderer.render(scene, camera);
              images.push(canvas.toDataURL('image/jpeg', 0.85));
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
      
      // AI 分类
      const predictions = new Map<string, number>();
      
      for (const imgData of images) {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = imgData;
        });
        
        if (img.width > 0) {
          try {
            const preds = await tfResult.mobilenet.classify(img, 5);
            for (const p of preds) {
              const current = predictions.get(p.className) || 0;
              predictions.set(p.className, current + p.probability);
            }
          } catch {}
        }
      }
      
      if (predictions.size > 0) {
        return Array.from(predictions.entries())
          .map(([className, probability]) => ({
            className: translate(className),
            probability: probability / images.length,
          }))
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 5);
      }
    } catch (error) {
      console.warn('[classifySTLModel] AI classification failed, using filename:', error);
    }
  }
  
  // 后备：文件名分类
  return classifyByFilename(cleanFilename);
}
