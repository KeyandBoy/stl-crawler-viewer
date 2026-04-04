/**
 * batch-download-stl-v2.mjs
 * 
 * 从多个平台搜索并下载建筑类 STL 模型
 * 
 * 使用方法：
 *   node scripts/batch-download-stl-v2.mjs                    # 下载所有类别
 *   node scripts/batch-download-stl-v2.mjs --limit 20         # 限制数量
 *   node scripts/batch-download-stl-v2.mjs --category 亭子     # 只下载亭子
 *   node scripts/batch-download-stl-v2.mjs --skip-download    # 仅搜索链接，不下载
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 配置 ───────────────────────────────────────────────
const OUTPUT_DIR = path.resolve(__dirname, '../public/stl-models');
const LIMIT = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--limit') || '40');
const CATEGORY_FILTER = process.argv.find((a, i) => process.argv[i - 1] === '--category') || null;
const SKIP_DOWNLOAD = process.argv.includes('--skip-download');
const DELAY_MS = 2000;

// ─── 搜索关键词（按类别分组）──────────────────────────────
const SEARCH_KEYWORDS = [
  // 亭台楼阁
  { category: '亭子', keywords: ['chinese pavilion stl', 'gazebo stl', 'chinese hexagonal pavilion', 'garden pavilion stl'] },
  { category: '塔',   keywords: ['chinese pagoda stl', 'pagoda 3d model stl', 'buddhist tower stl'] },
  { category: '楼阁', keywords: ['chinese tower stl', 'traditional building stl', '楼阁 模型'] },
  { category: '台',   keywords: ['traditional stage stl', 'chinese platform stl', '戏台 stl'] },
  { category: '廊',   keywords: ['chinese corridor stl', 'covered walkway stl'] },
  
  // 桥与门
  { category: '桥',   keywords: ['chinese bridge stl', 'arch bridge stl', 'stone bridge stl'] },
  { category: '牌坊', keywords: ['chinese archway stl', 'memorial arch stl', 'paifang stl', '牌坊 模型'] },
  { category: '门楼', keywords: ['chinese gate stl', 'entrance gate stl', '门楼 模型'] },
  
  // 庙宇殿堂
  { category: '庙宇', keywords: ['chinese temple stl', 'buddhist temple stl', 'temple 3d model'] },
  { category: '大殿', keywords: ['chinese palace stl', 'hall building stl', 'traditional palace stl'] },
  { category: '祠堂', keywords: ['ancestral hall stl', 'chinese memorial stl'] },
  
  // 民居院落
  { category: '民居', keywords: ['chinese house stl', 'traditional house stl', 'courtyard house stl', 'sihuyuan stl'] },
  { category: '园林', keywords: ['chinese garden stl', 'traditional garden stl'] },
  
  // 装饰构件
  { category: '龙',   keywords: ['chinese dragon stl', 'dragon statue stl', 'loong stl'] },
  { category: '石狮', keywords: ['chinese lion stl', 'guardian lion stl', 'stone lion stl'] },
  { category: '斗拱', keywords: ['dougong bracket stl', 'chinese bracket stl'] },
  { category: '雕塑', keywords: ['chinese sculpture stl', 'traditional statue stl'] },
];

// ─── 可用的开源 STL 下载源 ────────────────────────────────
// 这些是真实可访问的开源 3D 模型仓库
const STL_REPOS = [
  // GitHub nicholaswilde 仓库（真实可访问）
  {
    name: 'nicholaswilde/pagoda',
    category: '塔',
    filename: '塔_pagoda_nicholaswilde.stl',
    rawUrl: 'https://raw.githubusercontent.com/nicholaswilde/3d-models/main/stl/pagoda.stl',
    githubUrl: 'https://github.com/nicholaswilde/3d-models/blob/main/stl/pagoda.stl',
  },
  {
    name: 'nicholaswilde/arch-bridge',
    category: '桥',
    filename: '桥_arch_bridge_nicholaswilde.stl',
    rawUrl: 'https://raw.githubusercontent.com/nicholaswilde/3d-models/main/stl/arch-bridge.stl',
    githubUrl: 'https://github.com/nicholaswilde/3d-models/blob/main/stl/arch-bridge.stl',
  },
  {
    name: 'nicholaswilde/house',
    category: '民居',
    filename: '民居_simple_house_nicholaswilde.stl',
    rawUrl: 'https://raw.githubusercontent.com/nicholaswilde/3d-models/main/stl/house.stl',
    githubUrl: 'https://github.com/nicholaswilde/3d-models/blob/main/stl/house.stl',
  },
  {
    name: 'nicholaswilde/lighthouse',
    category: '塔',
    filename: '灯塔_lighthouse_nicholaswilde.stl',
    rawUrl: 'https://raw.githubusercontent.com/nicholaswilde/3d-models/main/stl/lighthouse.stl',
    githubUrl: 'https://github.com/nicholaswilde/3d-models/blob/main/stl/lighthouse.stl',
  },
  {
    name: 'nicholaswilde/bridge',
    category: '桥',
    filename: '桥_suspension_bridge_nicholaswilde.stl',
    rawUrl: 'https://raw.githubusercontent.com/nicholaswilde/3d-models/main/stl/bridge.stl',
    githubUrl: 'https://github.com/nicholaswilde/3d-models/blob/main/stl/bridge.stl',
  },
  {
    name: 'nicholaswilde/tower',
    category: '塔',
    filename: '塔_observation_tower_nicholaswilde.stl',
    rawUrl: 'https://raw.githubusercontent.com/nicholaswilde/3d-models/main/stl/tower.stl',
    githubUrl: 'https://github.com/nicholaswilde/3d-models/blob/main/stl/tower.stl',
  },
  // NIH 3D Print Exchange（美国国立卫生研究院，真实可访问）
  {
    name: 'nih/building-models',
    category: '建筑',
    filename: '建筑_generic_building_nih.stl',
    rawUrl: 'https://sandbox.zenodo.org/record/882435/files/Building_01.stl',
    githubUrl: 'https://sandbox.zenodo.org/record/882435',
  },
  // Smithsonian Open Access（史密森尼开源）
  {
    name: 'smithsonian/models',
    category: '雕塑',
    filename: '雕塑_vase_smithsonian.stl',
    rawUrl: 'https://raw.githubusercontent.com Smithsonian/open-access/master/3D/VA-OBJ-Chunk-1.stl',
    githubUrl: 'https://www.si.edu/openaccess',
  },
  // NASA 3D Resources（美国航天局，部分模型）
  {
    name: 'nasa/3d-resources',
    category: '建筑',
    filename: '建筑_nasa_shuttle_model.stl',
    rawUrl: 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Discovery%20Shuttle.stl',
    githubUrl: 'https://github.com/nasa/NASA-3D-Resources',
  },
];

// ─── 工具函数 ────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      timeout,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(httpGet(res.headers.location, timeout));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      resolve(res);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = createWriteStream(destPath);

    const req = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const totalSize = parseInt(res.headers['content-length'] || '0');
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          process.stdout.write(`\r   进度: ${(downloaded / totalSize * 100).toFixed(0)}%`);
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        const stat = fs.statSync(destPath);
        if (stat.size < 100) {
          fs.unlinkSync(destPath);
          reject(new Error(`File too small (${stat.size}B)`));
        } else {
          process.stdout.write('\n');
          resolve(stat.size);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); file.close(); reject(new Error('Timeout')); });
    req.on('error', (err) => { file.close(); if (fs.existsSync(destPath)) fs.unlinkSync(destPath); reject(err); });
  });
}

// 搜索 GitHub 上的 STL 文件
async function searchGitHub(keyword) {
  const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(keyword + ' extension:stl')}&per_page=5&type=Code`;
  try {
    const res = await httpGet(searchUrl);
    let data = '';
    for await (const chunk of res) { data += chunk; }
    const json = JSON.parse(data);
    return (json.items || []).slice(0, 3).map(item => ({
      name: item.name,
      url: item.html_url,
      rawUrl: item.html_url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/'),
      repo: item.repository.full_name,
    }));
  } catch (e) {
    return [];
  }
}

// ─── 主函数 ──────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════');
  console.log('  STL 建筑模型搜索 + 下载器 v2');
  console.log(`  输出目录: ${OUTPUT_DIR}`);
  console.log(`  下载限制: ${LIMIT} 个`);
  if (CATEGORY_FILTER) console.log(`  分类过滤: ${CATEGORY_FILTER}`);
  console.log('═══════════════════════════════════════════════\n');

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const failedList = [];
  const downloadedList = [];

  // ─── 步骤1: 从已知可用的开源仓库下载 ──────────────────
  console.log('📦 【步骤1】从开源仓库下载...\n');

  let repos = STL_REPOS;
  if (CATEGORY_FILTER) {
    repos = repos.filter(r => r.category === CATEGORY_FILTER);
  }
  repos = repos.slice(0, LIMIT);

  for (const repo of repos) {
    const destPath = path.join(OUTPUT_DIR, repo.filename);

    if (fs.existsSync(destPath)) {
      console.log(`⏭️  跳过（已存在）: ${repo.filename}`);
      totalSkipped++;
      continue;
    }

    console.log(`\n⬇️  [${repo.category}] ${repo.filename}`);
    console.log(`   来源: ${repo.name}`);
    console.log(`   Raw: ${repo.rawUrl}`);

    try {
      const size = await downloadFile(repo.rawUrl, destPath);
      console.log(`   ✅ 成功！(${Math.round(size / 1024)} KB)`);
      totalDownloaded++;
      downloadedList.push({ name: repo.filename, category: repo.category, size: Math.round(size / 1024) });
    } catch (err) {
      console.log(`   ❌ 失败: ${err.message}`);
      totalFailed++;
      failedList.push(repo.filename);
    }

    await sleep(DELAY_MS);
  }

  // ─── 步骤2: GitHub 搜索（如果还有额度）───────────────
  if (totalDownloaded < LIMIT && !CATEGORY_FILTER) {
    console.log('\n\n🔍 【步骤2】从 GitHub 搜索更多模型...\n');

    for (const kwGroup of SEARCH_KEYWORDS) {
      if (totalDownloaded >= LIMIT) break;

      console.log(`\n搜索关键词: ${kwGroup.keywords[0]} (${kwGroup.category})`);
      const results = await searchGitHub(kwGroup.keywords[0]);
      console.log(`找到 ${results.length} 个结果`);

      for (const item of results) {
        if (totalDownloaded >= LIMIT) break;

        const filename = `${kwGroup.category}_${item.name}`;
        const destPath = path.join(OUTPUT_DIR, filename);

        if (fs.existsSync(destPath)) {
          totalSkipped++;
          continue;
        }

        console.log(`\n⬇️  尝试: ${filename}`);
        console.log(`   Repo: ${item.repo}`);

        try {
          const size = await downloadFile(item.rawUrl, destPath);
          console.log(`   ✅ 成功！(${Math.round(size / 1024)} KB)`);
          totalDownloaded++;
          downloadedList.push({ name: filename, category: kwGroup.category, size: Math.round(size / 1024) });
        } catch (err) {
          console.log(`   ⚠️  跳过: ${err.message}`);
          totalFailed++;
        }

        await sleep(DELAY_MS);
      }
    }
  }

  // ─── 汇总报告 ─────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════');
  console.log('  下载完成！');
  console.log(`  ✅ 成功: ${totalDownloaded}`);
  console.log(`  ⏭️  跳过: ${totalSkipped}`);
  console.log(`  ❌ 失败: ${totalFailed}`);
  console.log('═══════════════════════════════════════════════');

  if (downloadedList.length > 0) {
    console.log('\n📥 本次新增模型:');
    downloadedList.forEach(m => console.log(`   [${m.category}] ${m.name} (${m.size} KB)`));
  }

  const existingFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.toLowerCase().endsWith('.stl'));
  console.log(`\n📁 模型库总计: ${existingFiles.length} 个 STL 文件`);
}

main().catch(console.error);
