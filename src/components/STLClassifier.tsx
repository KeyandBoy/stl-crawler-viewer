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

// TensorFlow.js 中文翻译映射
const TRANSLATIONS: Record<string, string> = {
  'palace': '宫殿', 'temple': '庙宇', 'church': '教堂', 'tower': '塔楼',
  'castle': '城堡', 'bridge': '桥', 'arch': '拱门/牌坊', 'dome': '圆顶',
  'gazebo': '凉亭', 'pavilion': '亭子', 'roof': '屋顶', 'dragon': '龙',
  'lion': '狮子', 'statue': '雕像', 'sculpture': '雕塑', 'fountain': '喷泉',
  'garden': '园林', 'courtyard': '庭院', 'building': '建筑', 'house': '房屋',
  'pagoda': '宝塔', 'stupa': '佛塔', 'monastery': '寺院',
};

function translate(name: string): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(TRANSLATIONS)) {
    if (lower.includes(k)) return v;
  }
  return name;
}

// 初始化 TensorFlow.js（必须在浏览器环境中）
async function initTensorFlow(): Promise<{ tf: any; mobilenet: any }> {
  if (tfInstance && mobilenetInstance) {
    return { tf: tfInstance, mobilenet: mobilenetInstance };
  }
  
  if (initializing) {
    // 等待初始化完成
    await new Promise(r => setTimeout(r, 100));
    return initTensorFlow();
  }
  
  initializing = true;
  
  try {
    // 动态导入
    const tf = await import('@tensorflow/tfjs');
    const mobilenet = await import('@tensorflow-models/mobilenet');
    
    // 设置后端为 webgl（必须在浏览器中）
    console.log('[STLClassifier] Initializing TensorFlow.js...');
    await tf.setBackend('webgl');
    await tf.ready();
    
    console.log('[STLClassifier] Backend:', tf.getBackend());
    
    // 加载 MobileNet 模型
    console.log('[STLClassifier] Loading MobileNet model...');
    const model = await mobilenet.load({ version: 2, alpha: 1.0 });
    
    tfInstance = tf;
    mobilenetInstance = model;
    initializing = false;
    
    console.log('[STLClassifier] Model ready!');
    return { tf, mobilenet: model };
  } catch (error) {
    initializing = false;
    console.error('[STLClassifier] Init failed:', error);
    throw error;
  }
}

export function STLClassifier({ url, onClassify }: STLClassifierProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // 确保在客户端
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
          
          // 光源
          scene.add(new THREE.AmbientLight(0x606060, 2));
          
          const light1 = new THREE.DirectionalLight(0xffffff, 1);
          light1.position.set(1, 1, 1);
          scene.add(light1);
          
          const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
          light2.position.set(-1, -1, -1);
          scene.add(light2);
          
          // 网格
          const material = new THREE.MeshPhongMaterial({
            color: 0x00a8ff,
            specular: 0x222222,
            shininess: 150,
            flatShading: true,
          });
          const mesh = new THREE.Mesh(geometry, material);
          
          // 居中和缩放
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
          
          // 多角度渲染
          const angles = [
            { pos: [0, 0, 60], name: 'front' },
            { pos: [40, 40, 40], name: 'iso1' },
            { pos: [-40, 40, 40], name: 'iso2' },
            { pos: [0, 60, 0], name: 'top' },
            { pos: [60, 0, 0], name: 'side' },
          ];
          
          for (const angle of angles) {
            camera.position.set(angle.pos[0], angle.pos[1], angle.pos[2]);
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
    
    try {
      // 1. 初始化 TensorFlow.js
      setStatus('初始化 AI 模型...');
      const { mobilenet } = await initTensorFlow();
      
      // 2. 渲染 STL 图像
      setStatus('渲染 3D 模型...');
      const isPrivateBlob = url.includes('blob.vercel-storage.com');
      const fetchUrl = isPrivateBlob ? `/api/get-blob?url=${encodeURIComponent(url)}` : url;
      
      const images = await renderSTLImages(fetchUrl);
      setStatus(`已渲染 ${images.length} 个角度，分析中...`);
      
      // 3. 分类每张图像
      const predictions = new Map<string, number>();
      
      for (let i = 0; i < images.length; i++) {
        setStatus(`分析图像 ${i + 1}/${images.length}...`);
        
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = images[i];
        });
        
        if (img.width > 0) {
          try {
            const preds = await mobilenet.classify(img, 5);
            for (const p of preds) {
              const current = predictions.get(p.className) || 0;
              predictions.set(p.className, current + p.probability);
            }
          } catch (e) {
            console.warn('[STLClassifier] Image classification failed:', e);
          }
        }
      }
      
      // 4. 汇总结果
      const sortedResults = Array.from(predictions.entries())
        .map(([className, probability]) => ({
          className: translate(className),
          probability: probability / images.length,
        }))
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 5);
      
      setResults(sortedResults);
      setStatus('分类完成！');
      
      if (onClassify) {
        onClassify(sortedResults);
      }
    } catch (err) {
      console.error('[STLClassifier] Error:', err);
      const errMsg = err instanceof Error ? err.message : '分类失败';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

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
      
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
          ⚠️ {error}
        </div>
      )}
      
      {results.length > 0 && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 className="font-medium text-purple-800 mb-2">🎯 分类结果</h4>
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
                    {(r.probability * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            建议：使用「{results[0].className}」作为分类标签
          </p>
        </div>
      )}
    </div>
  );
}

// 批量分类工具函数
export async function classifySTLModel(url: string): Promise<ClassificationResult[]> {
  // 确保在客户端环境
  if (typeof window === 'undefined') {
    throw new Error('classifySTLModel 只能在浏览器中运行');
  }
  
  // 初始化
  const { mobilenet } = await initTensorFlow();
  
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
        const angles = [
          [0, 0, 60], [40, 40, 40], [-40, 40, 40], [0, 60, 0], [60, 0, 0]
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
  
  // 分类
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
        const preds = await mobilenet.classify(img, 5);
        for (const p of preds) {
          const current = predictions.get(p.className) || 0;
          predictions.set(p.className, current + p.probability);
        }
      } catch {}
    }
  }
  
  return Array.from(predictions.entries())
    .map(([className, probability]) => ({
      className: translate(className),
      probability: probability / images.length,
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
}
