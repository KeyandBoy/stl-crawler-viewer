/**
 * customModelClassifier.ts
 *
 * 专用古建筑分类模型加载与预测模块。
 * 未来 stl-classifier-trainer 导出的 model.json、weights.bin、labels.json
 * 放在 public/ai-models/ancient-architecture/ 下即可自动加载。
 */

// ── 配置 ──────────────────────────────────────────
const CUSTOM_MODEL_CONFIG = {
  modelUrl: '/ai-models/ancient-architecture/model.json',
  labelsUrl: '/ai-models/ancient-architecture/labels.json',
  inputSize: 224,
  enabled: true,
};

// ── 类型 ──────────────────────────────────────────
export interface ClassificationResult {
  className: string;
  probability: number;
}

/** labels.json 期望格式 */
interface CustomLabels {
  labels: string[];
  version?: string;
  inputSize?: number;
  /** 标记该模型是否为训练器导出的真实模型。占位模板必须为 false。 */
  verified?: boolean;
}

// ── 缓存 ──────────────────────────────────────────
let cachedTf: any = null;
let cachedModel: any = null;
let cachedLabels: CustomLabels | null = null;
let customModelStatus: 'untried' | 'loaded' | 'unavailable' = 'untried';
let loadPromise: Promise<boolean> | null = null;

// ── 标签加载 ──────────────────────────────────────
/**
 * 从 public/ai-models/ancient-architecture/labels.json 加载标签。
 * 如果加载失败，返回 null，专用模型分类不可用。
 */
async function loadCustomLabels(): Promise<CustomLabels | null> {
  if (cachedLabels) return cachedLabels;
  try {
    const res = await fetch(CUSTOM_MODEL_CONFIG.labelsUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: CustomLabels = await res.json();
    if (!data.labels || !Array.isArray(data.labels) || data.labels.length === 0) {
      throw new Error('labels.json 格式无效');
    }
    cachedLabels = data;
    return data;
  } catch (err) {
    console.warn('[CustomModel] labels.json 加载失败:', err);
    return null;
  }
}

// ── 专用模型初始化 ────────────────────────────────
/**
 * tryInitCustomModel
 *
 * 尝试加载训练器导出的 TFJS 模型。
 * - 加载 model.json + weights.bin
 * - 加载 labels.json
 * - 缓存模型实例和标签
 * - 失败时只 console.warn，返回 false
 *
 * 属于 custom / hybrid 模式的一部分。
 */
export async function tryInitCustomModel(): Promise<boolean> {
  // 已加载成功
  if (customModelStatus === 'loaded' && cachedModel && cachedLabels) return true;
  // 已确认不可用
  if (customModelStatus === 'unavailable') return false;
  // 正在加载中，等待结果
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      console.log('[CustomModel] 尝试加载专用模型...');

      // 1. 加载 labels.json
      const labels = await loadCustomLabels();
      if (!labels) {
        customModelStatus = 'unavailable';
        console.warn('[CustomModel] labels.json 不可用，跳过专用模型');
        return false;
      }

      // 1b. 检查 verified 标记（防止占位模型被误认为真实模型）
      if (labels.verified !== true) {
        customModelStatus = 'unavailable';
        console.warn('[CustomModel] labels.json 中 verified 不为 true，跳过专用模型（请使用训练器导出的真实模型）');
        return false;
      }

      // 2. 动态导入 tfjs
      const tf = await import('@tensorflow/tfjs');

      // 3. 确保后端已就绪（沿用已有后端或尝试 webgl）
      try {
        if (!tf.getBackend()) {
          for (const backend of ['webgl', 'wasm', 'cpu']) {
            try {
              await tf.setBackend(backend);
              await tf.ready();
              console.log('[CustomModel] TF backend:', tf.getBackend());
              break;
            } catch { /* 继续 */ }
          }
        }
      } catch { /* 忽略 */ }

      // 4. 加载 model.json（含超时）
      const model = await Promise.race([
        tf.loadLayersModel(CUSTOM_MODEL_CONFIG.modelUrl),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Custom model load timeout (20s)')), 20000)
        ),
      ]);

      cachedTf = tf;
      cachedModel = model;
      customModelStatus = 'loaded';
      console.log('[CustomModel] 专用模型加载成功, 标签:', labels.labels);
      return true;
    } catch (err) {
      customModelStatus = 'unavailable';
      console.warn('[CustomModel] 专用模型加载失败，降级到 fast 模式:', err);
      return false;
    }
  })();

  return loadPromise;
}

// ── 专用模型预测 ──────────────────────────────────
/**
 * classifyWithCustomModel
 *
 * 使用专用模型对 STL 多视角图片进行预测。
 * 流程：
 * 1. 每张图片 → tensor
 * 2. resize 到 inputSize x inputSize
 * 3. 归一化 0~1
 * 4. 模型预测
 * 5. 多视角概率平均
 * 6. 映射为 ClassificationResult[]
 *
 * 属于 custom / hybrid 模式。
 */
export async function classifyWithCustomModel(
  images: string[]
): Promise<ClassificationResult[]> {
  if (!cachedModel || !cachedTf || !cachedLabels) {
    return [];
  }

  const tf = cachedTf;
  const model = cachedModel;
  const labels = cachedLabels.labels;
  const inputSize = cachedLabels.inputSize || CUSTOM_MODEL_CONFIG.inputSize;

  try {
    const allProbs: number[][] = [];

    for (const imgData of images) {
      try {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = imgData;
        });

        // 转 tensor → resize → 归一化
        const tensor = tf.browser
          .fromPixels(img)
          .resizeBilinear([inputSize, inputSize])
          .toFloat()
          .div(tf.scalar(255))
          .expandDims(0);

        // 模型预测
        const preds = model.predict(tensor) as any;
        const probs: number[] = Array.from(preds.dataSync());

        allProbs.push(probs);

        // 清理 tensor 防止内存泄漏
        tensor.dispose();
        if (preds.dispose) preds.dispose();
      } catch {
        // 单张图片预测失败，跳过
      }
    }

    // 如果所有图片都失败，返回空
    if (allProbs.length === 0) return [];

    // 对多视角概率求平均
    const numClasses = labels.length;
    const avgProbs = new Array(numClasses).fill(0);
    for (const probs of allProbs) {
      for (let j = 0; j < Math.min(probs.length, numClasses); j++) {
        avgProbs[j] += probs[j];
      }
    }
    for (let j = 0; j < numClasses; j++) {
      avgProbs[j] /= allProbs.length;
    }

    // 转成 ClassificationResult[] 并按概率排序
    const results: ClassificationResult[] = labels
      .map((className, idx) => ({
        className,
        probability: avgProbs[idx] || 0,
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    return results;
  } catch (err) {
    console.warn('[CustomModel] 预测失败:', err);
    return [];
  }
}

// ── 状态查询 ──────────────────────────────────────
/** 返回专用模型是否已成功加载 */
export function isCustomModelAvailable(): boolean {
  return customModelStatus === 'loaded' && cachedModel !== null;
}

/** 返回当前标签列表（仅加载成功后可用） */
export function getCustomLabels(): string[] | null {
  return cachedLabels?.labels || null;
}

/** 重置缓存（主要用于测试） */
export function resetCustomModelCache(): void {
  cachedTf = null;
  cachedModel = null;
  cachedLabels = null;
  customModelStatus = 'untried';
  loadPromise = null;
}
