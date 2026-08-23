/**
 * generate-placeholder-model.mjs
 *
 * 生成与 stl-classifier-trainer 相同架构的占位 TFJS 模型（不依赖 tfjs-node）。
 * 手动构造 model.json + weight.bin 文件。
 */

import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import * as path from 'path';

const LABELS = [
  '六角亭', '八角亭', '四角亭', '圆亭', '亭子',
  '塔', '桥', '牌坊', '城门', '大殿',
  '庙宇', '祠堂', '四合院', '徽派民居', '民居',
  '斗拱', '飞檐', '榫卯', '龙', '石狮',
  '假山', '水榭', '园林', '古建筑',
];

const OUTPUT_DIR = path.resolve(
  'E:/computerProgram2/project/software/stl-crawler-independent1.0/stl-crawler-independent/public/ai-models/ancient-architecture'
);

function buildModel(numClasses) {
  const input = tf.input({ shape: [224, 224, 3] });

  let x = tf.layers.conv2d({
    filters: 32, kernelSize: 3, strides: 2, padding: 'same',
    activation: 'relu', name: 'conv2d_1'
  }).apply(input);
  x = tf.layers.conv2d({
    filters: 64, kernelSize: 3, strides: 2, padding: 'same',
    activation: 'relu', name: 'conv2d_2'
  }).apply(x);
  x = tf.layers.conv2d({
    filters: 128, kernelSize: 3, strides: 2, padding: 'same',
    activation: 'relu', name: 'conv2d_3'
  }).apply(x);
  x = tf.layers.conv2d({
    filters: 256, kernelSize: 3, strides: 2, padding: 'same',
    activation: 'relu', name: 'conv2d_4'
  }).apply(x);

  x = tf.layers.globalAveragePooling2d({ dataFormat: 'channelsLast', name: 'gap' }).apply(x);

  x = tf.layers.dense({ units: 256, activation: 'relu', name: 'dense_1' }).apply(x);
  x = tf.layers.dropout({ rate: 0.3, name: 'dropout_1' }).apply(x);
  x = tf.layers.dense({ units: 128, activation: 'relu', name: 'dense_2' }).apply(x);
  x = tf.layers.dropout({ rate: 0.2, name: 'dropout_2' }).apply(x);
  const output = tf.layers.dense({ units: numClasses, activation: 'softmax', name: 'dense_3' }).apply(x);

  const model = tf.model({ inputs: input, outputs: output });
  return model;
}

function serializeModel(model) {
  // 获取模型拓扑（toJSON 返回的是 JSON 字符串）
  const raw = model.toJSON();
  const topology = typeof raw === 'string' ? JSON.parse(raw) : raw;

  // TFJS weights.bin 格式：对每个权重
  // [name_len:Uint32][name:UTF-8][data_len:Uint32][data:float32]
  const weights = model.getWeights();
  const bufParts = [];
  let offset = 0;
  const manifest = [];

  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    const shape = w.shape;
    const name = w.name;
    const dtype = 'float32';
    const data = w.dataSync(); // Float32Array
    const dataBytes = data.byteLength; // float32 = 4 bytes per element
    const nameBuf = Buffer.from(name, 'utf-8');
    const nameLen = nameBuf.length;

    // name length (Uint32)
    const nameLenBuf = Buffer.alloc(4);
    nameLenBuf.writeUInt32LE(nameLen, 0);

    // data length (Uint32)
    const dataLenBuf = Buffer.alloc(4);
    dataLenBuf.writeUInt32LE(dataBytes, 0);

    // weight data
    const dataBuf = Buffer.from(data.buffer, data.byteOffset, dataBytes);

    const entry = Buffer.concat([nameLenBuf, nameBuf, dataLenBuf, dataBuf]);
    bufParts.push(entry);

    manifest.push({
      name: name,
      shape: shape,
      dtype: dtype,
    });

    offset += entry.length;
    w.dispose();
  }

  const weightData = Buffer.concat(bufParts);

  return { topology, manifest, weightData };
}

function writeModel(topology, manifest, weightData, labels) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 写 model.json（包含 weightsManifest）
  const modelJson = {
    ...topology,
    weightsManifest: [
      {
        paths: ['weights.bin'],
        weights: manifest,
      },
    ],
  };

  const modelJsonPath = path.join(OUTPUT_DIR, 'model.json');
  fs.writeFileSync(modelJsonPath, JSON.stringify(modelJson, null, 2), 'utf-8');
  console.log('✓ model.json 写入完成');

  // 写 weights.bin
  const weightsPath = path.join(OUTPUT_DIR, 'weights.bin');
  fs.writeFileSync(weightsPath, weightData);
  console.log(`✓ weights.bin 写入完成 (${(weightData.length / 1024 / 1024).toFixed(2)} MB)`);

  // 写 labels.json
  const labelsJson = { labels, version: '1.0.0', inputSize: 224 };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'labels.json'), JSON.stringify(labelsJson, null, 2), 'utf-8');
  console.log('✓ labels.json 写入完成');
}

async function main() {
  console.log('构建模型...');
  const numClasses = LABELS.length;
  const model = buildModel(numClasses);

  // 触发一次 predict 来创建权重
  const dummy = tf.randomNormal([1, 224, 224, 3]);
  model.predict(dummy);
  dummy.dispose();

  console.log(`模型参数总数: ${model.countParams()}`);

  console.log('序列化模型...');
  const { topology, manifest, weightData } = serializeModel(model);

  console.log('写入文件...');
  writeModel(topology, manifest, weightData, LABELS);

  // 验证
  const files = fs.readdirSync(OUTPUT_DIR);
  console.log('\n输出文件:', files);

  console.log('\n✅ 占位模型生成完成！');
}

main().catch(err => {
  console.error('生成失败:', err);
  process.exit(1);
});
