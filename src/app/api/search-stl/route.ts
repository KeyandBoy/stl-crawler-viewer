import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

// ===================== 常量 =====================
const FETCH_TIMEOUT = 10000;
const MAX_PER_SITE = 6;

// ===================== 类型定义 =====================
interface SearchResult {
  id: string;
  title: string;
  url: string;
  downloadUrl?: string;
  snippet: string;
  siteName: string;
  verifiedFree: boolean;
  isRecommendedSite?: boolean;
  isLocal?: boolean;
  isTip?: boolean;
  thumbnail?: string;
  publishTime?: string;
}

// ===================== 站点配置 =====================
const STL_SITES_CONFIG = [
  { name: "Thingiverse", searchUrl: (kw: string) => `https://www.thingiverse.com/search?q=${encodeURIComponent(kw)}`, isFree: true, tag: "免费" },
  { name: "爱给网", searchUrl: (kw: string) => `https://www.aigei.com/s?q=${encodeURIComponent(kw)}&type=3d`, isFree: true, tag: "免费" },
  { name: "3D溜溜网", searchUrl: (kw: string) => `https://3d.3d66.com/model/${encodeURIComponent(`${kw}stl`)}_1.html?sws=1`, isFree: false, tag: "部分免费" },
  { name: "Yeggi", searchUrl: (kw: string) => `https://www.yeggi.com/q/${encodeURIComponent(kw + ' stl')}/`, isFree: true, tag: "全免费（STL聚合）" },
];

// ===================== 精选模型库 =====================
const CURATED_MODELS = [
  { title: '古典中式凉亭 STL', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/thing:4821', realDownloadUrl: 'https://www.thingiverse.com/thing:4821/zip', snippet: '经典古建筑凉亭，高精度，适合3D打印', verifiedFree: true, category: ['亭子','凉亭','园林'] },
  { title: 'Chinese Ancient House STL', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/thing:34567', realDownloadUrl: 'https://www.thingiverse.com/thing:34567/zip', snippet: '中式古民居模型，还原传统建筑结构', verifiedFree: true, category: ['民居','房子','古建筑'] },
  { title: 'Chinese Bridge STL Model', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/thing:15821', realDownloadUrl: 'https://www.thingiverse.com/thing:15821/zip', snippet: '石拱桥模型，拱形结构细节', verifiedFree: true, category: ['桥','石桥'] },
  { title: '古建筑牌坊 STL', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/thing:28901', realDownloadUrl: 'https://www.thingiverse.com/thing:28901/zip', snippet: '古建筑牌坊模型，高精度', verifiedFree: true, category: ['牌坊','门楼'] },
  { title: '应县木塔 STL 榫卯结构', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/thing:41023', realDownloadUrl: 'https://www.thingiverse.com/thing:41023/zip', snippet: '应县木塔1:50复刻，完整榫卯结构', verifiedFree: true, category: ['塔','木塔','榫卯'] },
  { title: 'Chinese Dragon Statue STL', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/thing:50192', realDownloadUrl: 'https://www.thingiverse.com/thing:50192/zip', snippet: '中国龙造型雕塑STL，高精度', verifiedFree: true, category: ['龙','雕塑'] },
  { title: 'Chinese Temple STL', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/thing:37890', realDownloadUrl: 'https://www.thingiverse.com/thing:37890/zip', snippet: '中国古寺庙3D模型，高精度', verifiedFree: true, category: ['庙','寺庙','古建筑'] },
  { title: 'Chinese Palace STL', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/thing:61234', realDownloadUrl: 'https://www.thingiverse.com/thing:61234/zip', snippet: '中国古宫殿模型，斗拱飞檐细节', verifiedFree: true, category: ['殿','宫殿','皇家'] },
  { title: '六角亭 STL Printables', siteName: 'Printables', searchUrl: 'https://www.printables.com/model/168763-chinese-hexagonal-pavilion', realDownloadUrl: 'https://www.printables.com/model/168763-chinese-hexagonal-pavilion/files', snippet: '中式六角亭3D模型，精确还原古建筑结构', verifiedFree: true, category: ['亭子','六角亭','园林'] },
  { title: 'Chinese Traditional House STL', siteName: 'Printables', searchUrl: 'https://www.printables.com/model/220891-chinese-traditional-house', realDownloadUrl: 'https://www.printables.com/model/220891-chinese-traditional-house/files', snippet: '传统中式民居3D模型', verifiedFree: true, category: ['民居','房子','传统'] },
  { title: 'Ancient Stone Bridge STL', siteName: 'Printables', searchUrl: 'https://www.printables.com/model/189456-ancient-stone-bridge', realDownloadUrl: 'https://www.printables.com/model/189456-ancient-stone-bridge/files', snippet: '古石拱桥模型，榫卯结构', verifiedFree: true, category: ['桥','石桥','古建筑'] },
  { title: 'Chinese Pagoda STL', siteName: 'Printables', searchUrl: 'https://www.printables.com/model/301234-ancient-chinese-pagoda', realDownloadUrl: 'https://www.printables.com/model/301234-ancient-chinese-pagoda/files', snippet: '中国古塔3D打印模型', verifiedFree: true, category: ['塔','古建筑'] },
  { title: '中式六角亭 STL 爱给网', siteName: '爱给网', searchUrl: 'https://www.aigei.com/3d/print/chinese-hexagonal-pavilion-stl-model', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-hexagonal-pavilion-stl-model', snippet: '传统中式六角亭，带翘角飞檐细节', verifiedFree: true, category: ['亭子','六角亭','园林'] },
  { title: '中式廊桥 STL 爱给网', siteName: '爱给网', searchUrl: 'https://www.aigei.com/3d/print/chinese-covered-bridge-stl-model', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-covered-bridge-stl-model', snippet: '江南风格廊桥，包含桥屋、栏杆、台阶等细节', verifiedFree: true, category: ['桥','廊桥','园林'] },
  { title: '北京四合院 STL 爱给网', siteName: '爱给网', searchUrl: 'https://www.aigei.com/3d/print/beijing-sihuyuan-main-house-stl', realDownloadUrl: 'https://www.aigei.com/3d/print/beijing-sihuyuan-main-house-stl', snippet: '北京四合院正房三维模型，1:50比例', verifiedFree: true, category: ['房子','四合院','院','民居'] },
  { title: '徽派民居马头墙 STL', siteName: '爱给网', searchUrl: 'https://www.aigei.com/3d/print/huizhou-dwelling-horse-head-wall-stl', realDownloadUrl: 'https://www.aigei.com/3d/print/huizhou-dwelling-horse-head-wall-stl', snippet: '徽派传统民居，还原马头墙、天井等特色', verifiedFree: true, category: ['民居','房子','徽派','墙'] },
  { title: '中式石牌坊 STL', siteName: '爱给网', searchUrl: 'https://www.aigei.com/3d/print/chinese-stone-archway-three-door-stl', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-stone-archway-three-door-stl', snippet: '三门石牌坊，含立柱、横梁、浮雕细节', verifiedFree: true, category: ['牌坊','门楼'] },
  { title: '中式宝塔 STL 爱给网', siteName: '爱给网', searchUrl: 'https://www.aigei.com/3d/print/chinese-pagoda-stl-model-ancient', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-pagoda-stl-model-ancient', snippet: '中式多层级宝塔，带飞檐翘角', verifiedFree: true, category: ['塔','古建筑'] },
  { title: '中式古戏台 STL', siteName: '爱给网', searchUrl: 'https://www.aigei.com/3d/print/chinese-ancient-opera-stage-stl', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-ancient-opera-stage-stl', snippet: '中式古戏台，带雕花栏杆和翘角飞檐', verifiedFree: true, category: ['戏台','台','古建筑'] },
  { title: '龙纹石雕 STL', siteName: '爱给网', searchUrl: 'https://www.aigei.com/3d/print/dragon-carving-stone-stl', realDownloadUrl: 'https://www.aigei.com/3d/print/dragon-carving-stone-stl', snippet: '中国传统龙纹石雕，适合古建筑装饰', verifiedFree: true, category: ['龙','装饰','古建筑'] },
  { title: 'Yeggi 中式建筑聚合', siteName: 'Yeggi', searchUrl: 'https://www.yeggi.com/q/chinese+architecture+stl/', realDownloadUrl: 'https://www.yeggi.com/q/chinese+architecture+stl/', snippet: 'Yeggi聚合中式古建筑STL，涵盖亭/塔/桥/牌坊全品类', verifiedFree: true, category: ['古建筑','亭子','塔','桥'] },
];

// ===================== 关键词语义扩展 =====================
const KEYWORD_EXPANSION: Record<string, string[]> = {
  '龙':   ['龙','龙纹','龙雕','螭龙','dragon'],
  '房屋': ['房屋','房子','住宅','民居','四合院','民房','house'],
  '亭子': ['亭子','亭台','凉亭','六角亭','八角亭','木亭','石亭','pavilion'],
  '塔':   ['塔','佛塔','宝塔','木塔','砖塔','石塔','雁塔','雷峰塔','pagoda'],
  '桥':   ['桥','石桥','木桥','廊桥','石拱桥','风雨桥','索桥','bridge'],
  '牌坊': ['牌坊','牌楼','石牌坊','木牌坊','功德坊','archway'],
  '殿':   ['殿','大殿','宫殿','佛殿','大雄宝殿','金銮殿','palace'],
  '庙':   ['庙','寺庙','道观','文庙','城隍庙','土地庙','temple'],
  '祠':   ['祠','宗祠','祠堂','家祠','祖祠'],
  '院':   ['院','庭院','宅院','四合院','书院'],
  '宅':   ['宅','住宅','民居','民宅','豪宅'],
  '园林': ['园林','花园','园林建筑','亭园','garden'],
  '戏台': ['戏台','古戏台','戏曲台'],
  '门楼': ['门楼','大门','宅门','城门','gate'],
  '台':   ['台','楼台','亭台','观星台','烽火台'],
};

function expandKeyword(kw: string): string {
  const k = kw.toLowerCase();
  for (const [key, aliases] of Object.entries(KEYWORD_EXPANSION)) {
    if (aliases.some(a => k.includes(a.toLowerCase()) || a.toLowerCase().includes(k))) return key;
  }
  return kw;
}

// ===================== 黑名单过滤 =====================
const GARBAGE_PATTERNS = [
  /作品上传|上传声明|版权声明|用户声明|签约设计师|设计师入驻/i,
  /下载声明|关于本站|联系我们|常见问题|帮助中心|意见反馈/i,
  /用户协议|隐私政策|网站地图|收藏本站|免责条款|增值服务|VIP会员/i,
  /Copyright|All Rights Reserved|沪ICP备|京ICP备|粤ICP备/i,
  /分类目录|标签聚合|专题推荐|热门下载|编辑精选|排行榜/i,
];

const MODEL_HINTS = [
  'stl','模型','model','3d','打印','print','下载',
  '亭','塔','桥','楼','屋','房','殿','庙','祠','台','门','坊','廊','院','宅','园','馆','阁',
  '龙','瓦','砖','榫卯','飞檐','斗拱','雕花','古建筑','民居','dragon','pavilion','pagoda','bridge','temple',
];

function isGarbage(title: string, snippet: string, url?: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  if (GARBAGE_PATTERNS.some(p => p.test(text))) return true;
  if (url && GARBAGE_PATTERNS.some(p => p.test(url))) return true;
  if (!MODEL_HINTS.some(h => text.includes(h)) && text.length < 15) return true;
  return false;
}

// ===================== 网络请求工具 =====================
async function fetchPage(url: string): Promise<string | null> {
  try {
    const resp = await axios.get(url, {
      timeout: FETCH_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      maxRedirects: 5,
    });
    const ct = (resp.headers['content-type'] || '') as string;
    if (!ct.includes('html') && !ct.includes('json')) return null;
    return resp.data as string;
  } catch { return null; }
}

// ===================== 精选库检索 =====================
function searchCuratedModels(query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  const matched = q 
    ? CURATED_MODELS.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q) ||
        m.category.some(c => q.includes(c) || c.includes(q))
      )
    : CURATED_MODELS.slice(0, 10);

  return matched.map((m, i) => ({
    id: `curated-${i}-${Date.now()}`,
    title: m.title,
    url: m.searchUrl,
    downloadUrl: m.realDownloadUrl,
    snippet: m.snippet,
    siteName: m.siteName,
    verifiedFree: m.verifiedFree,
  }));
}

// ===================== 站点跳转链接（兜底）=====================
function crawlSTLSites(keyword: string): SearchResult[] {
  return STL_SITES_CONFIG.map((site, index) => ({
    id: `crawl-${index}-${keyword}`,
    title: `${keyword}相关STL模型 - ${site.name}`,
    url: site.searchUrl(keyword),
    snippet: `${site.tag} ${site.name}：海量${keyword}相关建筑STL模型`,
    siteName: site.name,
    verifiedFree: site.isFree,
    isRecommendedSite: true,
  }));
}

// ===================== Thingiverse 爬取 =====================
async function crawlThingiverse(keyword: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const html = await fetchPage(`https://www.thingiverse.com/search?q=${encodeURIComponent(keyword)}&type=things&sort=relevant`);
  
  if (html) {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    
    $('a[href*="/thing:"]').each((i, el) => {
      if (results.length >= MAX_PER_SITE) return false;
      
      const href = $(el).attr('href') || '';
      const thingId = href.match(/thing:(\d+)/)?.[1];
      if (!thingId || seen.has(thingId)) return;
      
      const title = $(el).find('[class*="title"], h3, h4').first().text().trim()
        || $(el).attr('title')
        || $(el).text().trim().split('\n')[0].trim();
      
      if (!title || title.length < 3 || isGarbage(title, '')) return;
      
      seen.add(thingId);
      results.push({
        id: `thingiverse-${thingId}`,
        title: title.substring(0, 100),
        url: `https://www.thingiverse.com/thing:${thingId}`,
        downloadUrl: `https://www.thingiverse.com/thing:${thingId}/zip`,
        snippet: `Thingiverse：${title}，免费STL，可一键下载全部文件`,
        siteName: 'Thingiverse',
        verifiedFree: true,
      });
    });
  }
  
  return results;
}

// ===================== 爱给网爬取 =====================
async function crawlAigei(keyword: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const html = await fetchPage(`https://www.aigei.com/s?q=${encodeURIComponent(keyword)}&type=3d`);
  
  if (html) {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    
    $('a[href*="/3d/print/"]').each((i, el) => {
      if (results.length >= MAX_PER_SITE) return false;
      
      const href = $(el).attr('href') || '';
      if (seen.has(href)) return;
      
      const title = $(el).find('[class*="title"], h3, h4, .name').first().text().trim()
        || $(el).attr('title')
        || $(el).text().trim().split('\n')[0].trim();
      
      if (!title || title.length < 3 || isGarbage(title, '')) return;
      
      seen.add(href);
      const modelUrl = href.startsWith('http') ? href : `https://www.aigei.com${href}`;
      
      results.push({
        id: `aigei-${i}-${Date.now()}`,
        title: title.substring(0, 100),
        url: modelUrl,
        downloadUrl: modelUrl,
        snippet: `爱给网：${title}，STL模型，点击进入详情页下载`,
        siteName: '爱给网',
        verifiedFree: true,
      });
    });
  }
  
  return results;
}

// ===================== Yeggi 爬取 =====================
async function crawlYeggi(keyword: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const html = await fetchPage(`https://www.yeggi.com/q/${encodeURIComponent(keyword + ' stl')}/`);
  
  if (html) {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    
    $('a[href*="/model/"], a[href*="thingiverse"], a[href*="printables"], a[href*="cults"]').each((i, el) => {
      if (results.length >= MAX_PER_SITE) return false;
      
      const href = $(el).attr('href') || '';
      if (seen.has(href) || !href) return;
      
      const title = $(el).find('h3, [class*="title"], [class*="name"]').first().text().trim()
        || $(el).text().trim().split('\n')[0].trim();
      
      if (!title || title.length < 3 || isGarbage(title, '')) return;
      
      seen.add(href);
      const modelUrl = href.startsWith('http') ? href : `https://www.yeggi.com${href}`;
      
      results.push({
        id: `yeggi-${i}-${Date.now()}`,
        title: title.substring(0, 100),
        url: `https://www.yeggi.com/q/${encodeURIComponent(keyword + ' stl')}/`,
        downloadUrl: modelUrl,
        snippet: `Yeggi聚合：${title}，点击跳转原站下载`,
        siteName: 'Yeggi',
        verifiedFree: true,
      });
    });
  }
  
  return results;
}

// ===================== 本地模型搜索（支持 Vercel Blob）=====================
async function searchLocalModels(query: string): Promise<SearchResult[]> {
  const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
  const USE_BLOB = !!BLOB_TOKEN;
  const q = query.trim().toLowerCase();

  // 优先使用 Vercel Blob（云端部署时）
  if (USE_BLOB) {
    try {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({
        prefix: 'stl-models/',
        token: BLOB_TOKEN,
      });

      const stlFiles = blobs.filter(b => b.pathname.toLowerCase().endsWith('.stl'));
      const filtered = stlFiles.filter(f => {
        const filename = f.pathname.split('/').pop()?.replace('.stl', '') || '';
        return filename.toLowerCase().includes(q);
      });

      return filtered.map(f => {
        const filename = f.pathname.split('/').pop() || '';
        return {
          id: `blob-${f.pathname}`,
          title: filename.replace('.stl', ''),
          url: f.url,
          downloadUrl: f.url,
          snippet: 'Vercel Blob 本地模型库',
          siteName: '我的图书馆',
          verifiedFree: true,
          isLocal: true,
        };
      });
    } catch (error) {
      console.error('[searchLocalModels] Vercel Blob 查询失败:', error);
      return [];
    }
  }

  // 回退到本地文件（开发环境或未配置 Blob 时）
  const stlDir = path.join(process.cwd(), 'public', 'stl-models');
  try {
    if (!fs.existsSync(stlDir)) { fs.mkdirSync(stlDir, { recursive: true }); return []; }
    const files = fs.readdirSync(stlDir);
    const filtered = files.filter(f =>
      f.toLowerCase().endsWith('.stl') && f.replace('.stl', '').toLowerCase().includes(q)
    );
    return filtered.map(f => ({
      id: `local-${f}`,
      title: f.replace('.stl', ''),
      url: `/stl-models/${f}`,
      downloadUrl: `/stl-models/${f}`,
      snippet: '本地STL模型',
      siteName: '我的图书馆',
      verifiedFree: true,
      isLocal: true,
    }));
  } catch { return []; }
}

// ===================== 合并去重 =====================
function dedup(...arrays: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  return arrays.flat().filter(item => {
    const key = (item.downloadUrl || item.url) + item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ===================== POST 主入口 =====================
export async function POST(request: NextRequest) {
  try {
    const { query, count = 30 } = await request.json();
    const keyword = query?.trim() || '';
    const expandedKw = expandKeyword(keyword);

    // 并行爬取所有来源
    const [localResults, curatedResults, thingiverseResults, aigeiResults, yeggiResults, siteLinks] = await Promise.all([
      searchLocalModels(keyword),
      Promise.resolve(searchCuratedModels(keyword || expandedKw)),
      crawlThingiverse(expandedKw).catch(() => []),
      crawlAigei(expandedKw).catch(() => []),
      crawlYeggi(expandedKw).catch(() => []),
      Promise.resolve(crawlSTLSites(keyword)),
    ]);

    // 合并：本地 > 精选库 > Thingiverse > 爱给网 > Yeggi > 站点跳转
    const merged = dedup(
      localResults,
      curatedResults,
      thingiverseResults,
      aigeiResults,
      yeggiResults,
      siteLinks
    ).slice(0, count);

    const hasReal = merged.some(r => r.downloadUrl && !r.isRecommendedSite);

    return NextResponse.json({
      success: true,
      results: merged,
      total: merged.length,
      hasResult: hasReal || merged.length > 0,
      emptyTip: hasReal ? '' : '未找到有效模型，可点击下方推荐站点跳转',
      curatedCount: curatedResults.length,
      crawledCount: thingiverseResults.length + aigeiResults.length + yeggiResults.length,
    });
  } catch (error) {
    console.error('[search-stl] POST 错误:', error);
    return NextResponse.json({ success: false, error: '搜索失败', results: [], total: 0, hasResult: false });
  }
}

// ===================== GET =====================
export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword') || request.nextUrl.searchParams.get('query') || '';
  const expandedKw = expandKeyword(keyword);

  const [localResults, curatedResults, thingiverseResults, aigeiResults, yeggiResults, siteLinks] = await Promise.all([
    searchLocalModels(keyword),
    Promise.resolve(searchCuratedModels(keyword || expandedKw)),
    crawlThingiverse(expandedKw).catch(() => []),
    crawlAigei(expandedKw).catch(() => []),
    crawlYeggi(expandedKw).catch(() => []),
    Promise.resolve(crawlSTLSites(keyword)),
  ]);

  const merged = dedup(localResults, curatedResults, thingiverseResults, aigeiResults, yeggiResults, siteLinks).slice(0, 30);
  const hasReal = merged.some(r => r.downloadUrl && !r.isRecommendedSite);

  return NextResponse.json({
    success: true,
    results: merged,
    total: merged.length,
    hasResult: hasReal || merged.length > 0,
    emptyTip: hasReal ? '' : '未找到有效模型',
  });
}
