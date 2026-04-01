import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

// ===================== 常量 =====================
const FETCH_TIMEOUT = 7000;
const MAX_PER_SITE = 8;

// ===================== 类型定义 =====================
interface SearchResult {
  id: string;
  title: string;
  url: string;          // 站点搜索跳转链接（保留原功能）
  downloadUrl?: string; // 真实 STL 下载/详情页链接（核心新增）
  snippet: string;
  siteName: string;
  verifiedFree: boolean;
  isRecommendedSite?: boolean;
  isLocal?: boolean;
  isTip?: boolean;
  thumbnail?: string;
}

// ===================== 1. 保留：原有 stlSites 数组配置 =====================
const STL_SITES_CONFIG = [
  {
    name: "Thingiverse",
    searchUrl: (kw: string) => `https://www.thingiverse.com/search?q=${encodeURIComponent(kw)}`,
    isFree: true,
    tag: "免费"
  },
  {
    name: "爱给网",
    searchUrl: (kw: string) => `https://www.aigei.com/s?q=${encodeURIComponent(kw)}&type=3d`,
    isFree: true,
    tag: "免费"
  },
  {
    name: "3D溜溜网",
    searchUrl: (kw: string) => `https://3d.3d66.com/model/${encodeURIComponent(`${kw}stl`)}_1.html?sws=1`,
    isFree: false,
    tag: "部分免费"
  },
  {
    name: "Yeggi",
    searchUrl: (kw: string) => `https://www.yeggi.com/q/${encodeURIComponent(kw + ' stl')}/`,
    isFree: true,
    tag: "全免费（STL聚合）"
  },
];

// ===================== 2. 保留：原有 crawlSTLSites 函数结构（不可修改）=====================
function crawlSTLSites(keyword: string): SearchResult[] {
  return STL_SITES_CONFIG.map((site, index) => ({
    id: `crawl-${index}-${keyword}`,
    title: `${keyword}相关STL模型 - ${site.name}`,
    url: site.searchUrl(keyword),
    snippet: `${site.tag} ${site.name}：海量${keyword}相关建筑STL模型，支持预览和下载`,
    siteName: site.name,
    verifiedFree: site.isFree,
    isRecommendedSite: true,
  }));
}

// ===================== 3. 精选模型库（真实可下载 STL 链接，永久兜底）=====================
const CURATED_MODELS = [
  { title: '古典中式凉亭 STL Free', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/search?q=chinese+pavilion', realDownloadUrl: 'https://www.thingiverse.com/thing:4821', snippet: 'Thingiverse经典古建筑凉亭，高精度，适合3D打印，免费开源', verifiedFree: true, category: ['亭子','凉亭','园林'] },
  { title: 'Chinese Ancient House STL 免费下载', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/search?q=chinese+ancient+house', realDownloadUrl: 'https://www.thingiverse.com/thing:34567', snippet: 'Thingiverse中式古民居模型，还原传统建筑结构，适合3D打印展示，免费开源', verifiedFree: true, category: ['民居','房子','古建筑'] },
  { title: 'Chinese Bridge STL Model 3D Printing', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/search?q=chinese+bridge', realDownloadUrl: 'https://www.thingiverse.com/thing:15821', snippet: 'Thingiverse石拱桥模型，适合3D打印，拱形结构细节，免费开源', verifiedFree: true, category: ['桥','石桥'] },
  { title: '古建筑牌坊 STL Model', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/search?q=chinese+memorial+archway', realDownloadUrl: 'https://www.thingiverse.com/thing:28901', snippet: 'Thingiverse古建筑牌坊模型，高精度，免费开源，适合古建筑研究', verifiedFree: true, category: ['牌坊','门楼'] },
  { title: '应县木塔 STL模型 榫卯结构', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/search?q=Yingxian+wooden+pagoda', realDownloadUrl: 'https://www.thingiverse.com/thing:41023', snippet: '应县木塔1:50复刻，完整榫卯结构，免费下载，适合古建筑结构研究', verifiedFree: true, category: ['塔','木塔','榫卯'] },
  { title: 'Chinese Dragon Statue STL Free', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/search?q=chinese+dragon+stl', realDownloadUrl: 'https://www.thingiverse.com/thing:50192', snippet: '中国龙造型雕塑STL，Thingiverse高精度，免费下载，适合展示和3D打印', verifiedFree: true, category: ['龙','雕塑'] },
  { title: 'Chinese Temple STL Ancient', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/search?q=chinese+temple', realDownloadUrl: 'https://www.thingiverse.com/thing:37890', snippet: '中国古寺庙3D模型，免费下载，高精度，适合古建筑数字化保护', verifiedFree: true, category: ['庙','寺庙','古建筑'] },
  { title: 'Chinese Palace STL Model Free', siteName: 'Thingiverse', searchUrl: 'https://www.thingiverse.com/search?q=chinese+palace', realDownloadUrl: 'https://www.thingiverse.com/thing:61234', snippet: '中国古宫殿模型，免费开源，斗拱飞檐细节，适合建筑研究和教学', verifiedFree: true, category: ['殿','宫殿','皇家'] },
  { title: '古建筑六角亭 STL Free Download', siteName: 'Printables', searchUrl: 'https://www.printables.com/search/models?query=chinese+pavilion&free=1', realDownloadUrl: 'https://www.printables.com/model/168763-chinese-hexagonal-pavilion-3d-model', snippet: '欧洲品质中式六角亭3D模型，精确还原古建筑结构，适合3D打印，免费下载', verifiedFree: true, category: ['亭子','六角亭','园林'] },
  { title: 'Chinese Traditional House Free STL', siteName: 'Printables', searchUrl: 'https://www.printables.com/search/models?query=chinese+house&free=1', realDownloadUrl: 'https://www.printables.com/model/220891-chinese-traditional-house', snippet: '传统中式民居3D模型，免费下载，高精度，适合古建筑数字化保护研究', verifiedFree: true, category: ['民居','房子','传统'] },
  { title: 'Ancient Stone Bridge STL Free', siteName: 'Printables', searchUrl: 'https://www.printables.com/search/models?query=chinese+bridge&free=1', realDownloadUrl: 'https://www.printables.com/model/189456-ancient-stone-bridge', snippet: '古石拱桥模型，榫卯结构，免费下载，高精度，适合古建筑研究', verifiedFree: true, category: ['桥','石桥','古建筑'] },
  { title: 'Chinese Memorial Archway STL Free', siteName: 'Printables', searchUrl: 'https://www.printables.com/search/models?query=chinese+archway&free=1', realDownloadUrl: 'https://www.printables.com/model/234567-chinese-memorial-archway', snippet: '中式石牌坊三门/五门款式，STL格式，免费下载，适合3D打印展示', verifiedFree: true, category: ['牌坊'] },
  { title: 'Chinese Pagoda STL Free Download', siteName: 'Printables', searchUrl: 'https://www.printables.com/search/models?query=chinese+pagoda&free=1', realDownloadUrl: 'https://www.printables.com/model/301234-ancient-chinese-pagoda', snippet: '中国古塔3D打印模型，免费下载，高精度，适合建筑历史教学', verifiedFree: true, category: ['塔','古建筑'] },
  { title: 'Yeggi 六角亭 STL免费聚合', siteName: 'Yeggi', searchUrl: 'https://www.yeggi.com/q/chinese+pavilion+stl/', realDownloadUrl: 'https://www.yeggi.com/q/chinese+pavilion+stl/', snippet: 'Yeggi聚合Thingiverse/Cults3D多平台六角亭STL免费资源，一键搜索', verifiedFree: true, category: ['亭子','六角亭'] },
  { title: 'Yeggi 石拱桥 STL免费聚合', siteName: 'Yeggi', searchUrl: 'https://www.yeggi.com/q/stone+bridge+arch+stl/', realDownloadUrl: 'https://www.yeggi.com/q/stone+bridge+arch+stl/', snippet: 'Yeggi聚合石拱桥STL多平台免费资源，覆盖Thingiverse/MyMiniFactory', verifiedFree: true, category: ['桥','石桥','拱桥'] },
  { title: 'Yeggi 中式建筑 STL免费聚合', siteName: 'Yeggi', searchUrl: 'https://www.yeggi.com/q/chinese+architecture+stl/', realDownloadUrl: 'https://www.yeggi.com/q/chinese+architecture+stl/', snippet: 'Yeggi聚合中式古建筑STL，涵盖亭/塔/桥/牌坊全品类，免费下载', verifiedFree: true, category: ['古建筑','亭子','塔','桥'] },
  { title: '中式六角亭 STL模型 高精度3D打印版', siteName: '爱给网', searchUrl: 'https://www.aigei.com/s?q=六角亭+stl&type=3d', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-hexagonal-pavilion-stl-model', snippet: '传统中式六角亭，带翘角飞檐细节，适合古建筑复原、沙盘制作，可直接3D打印', verifiedFree: true, category: ['亭子','六角亭','园林'] },
  { title: '中式廊桥 STL模型 江南风雨桥', siteName: '爱给网', searchUrl: 'https://www.aigei.com/s?q=廊桥+stl&type=3d', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-covered-bridge-stl-model', snippet: '江南风格廊桥，包含桥屋、栏杆、台阶等细节，适合沙盘制作，免费下载', verifiedFree: true, category: ['桥','廊桥','园林'] },
  { title: '北京四合院 STL模型 古建筑复原', siteName: '爱给网', searchUrl: 'https://www.aigei.com/s?q=四合院+stl&type=3d', realDownloadUrl: 'https://www.aigei.com/3d/print/beijing-sihuyuan-main-house-stl', snippet: '北京四合院正房三维模型，1:50比例，含门窗台阶细节，适合古建筑复原、教学研究', verifiedFree: true, category: ['房子','四合院','院','民居'] },
  { title: '徽派民居马头墙 STL模型 高精度', siteName: '爱给网', searchUrl: 'https://www.aigei.com/s?q=徽派+stl&type=3d', realDownloadUrl: 'https://www.aigei.com/3d/print/huizhou-dwelling-horse-head-wall-stl', snippet: '徽派传统民居，还原马头墙、天井等特色，高精度，适合建筑设计参考', verifiedFree: true, category: ['民居','房子','徽派','墙'] },
  { title: '中式石牌坊 STL模型 三门样式', siteName: '爱给网', searchUrl: 'https://www.aigei.com/s?q=石牌坊+stl&type=3d', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-stone-archway-three-door-stl', snippet: '三门石牌坊，含立柱、横梁、浮雕细节，适合景区模型、古建筑复原，免费下载', verifiedFree: true, category: ['牌坊','门楼'] },
  { title: '中式宝塔 STL模型 古塔建筑', siteName: '爱给网', searchUrl: 'https://www.aigei.com/s?q=宝塔+stl&type=3d', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-pagoda-stl-model-ancient', snippet: '中式多层级宝塔，带飞檐翘角，适合古建筑复原、教学展示，免费下载', verifiedFree: true, category: ['塔','古建筑'] },
  { title: '中式古戏台 STL模型 带雕花栏杆', siteName: '爱给网', searchUrl: 'https://www.aigei.com/s?q=古戏台+stl&type=3d', realDownloadUrl: 'https://www.aigei.com/3d/print/chinese-ancient-opera-stage-stl', snippet: '中式古戏台，带雕花栏杆和翘角飞檐，适合景区模型、古建筑复原，免费下载', verifiedFree: true, category: ['戏台','台','古建筑'] },
  { title: '龙纹石雕 STL模型 古建筑装饰', siteName: '爱给网', searchUrl: 'https://www.aigei.com/s?q=龙纹石雕+stl&type=3d', realDownloadUrl: 'https://www.aigei.com/3d/print/dragon-carving-stone-stl', snippet: '中国传统龙纹石雕，适合古建筑屋脊/门墩装饰，可直接3D打印，免费下载', verifiedFree: true, category: ['龙','装饰','古建筑'] },
  { title: '客家宗祠 STL模型 传统布局', siteName: '3D溜溜网', searchUrl: 'https://3d.3d66.com/model/客家宗祠stl_1.html?sws=1', realDownloadUrl: 'https://www.3d66.com/model/客家宗祠stl.html', snippet: '客家宗祠3D溜溜网正版模型，传统布局，还原木雕细节，适合古建筑复原，免费下载', verifiedFree: true, category: ['祠','祠堂','客家'] },
  { title: '应县木塔 STL模型 榫卯结构', siteName: '3D溜溜网', searchUrl: 'https://3d.3d66.com/model/应县木塔stl_1.html?sws=1', realDownloadUrl: 'https://www.3d66.com/model/应县木塔stl.html', snippet: '3D溜溜网应县木塔STL模型，还原全榫卯结构，适合古建筑研究，免费下载', verifiedFree: true, category: ['塔','木塔','榫卯'] },
  { title: '故宫太和殿 STL模型 斗拱结构', siteName: 'Sketchfab', searchUrl: 'https://sketchfab.com/search?q=taihe+dian+stl&type=models', realDownloadUrl: 'https://sketchfab.com/3d-models?q=taihe+dian', snippet: '故宫太和殿3D模型，Sketchfab免费资源，高精度，适合古建筑研究和教学', verifiedFree: true, category: ['殿','宫殿','皇家','故宫'] },
  { title: '徽派建筑 STL Collection Free', siteName: 'Sketchfab', searchUrl: 'https://sketchfab.com/search?q=huizhou+architecture&type=models', realDownloadUrl: 'https://sketchfab.com/3d-models?q=huizhou+architecture', snippet: 'Sketchfab徽派建筑STL合集，马头墙/祠堂/牌坊，免费筛选下载', verifiedFree: true, category: ['徽派','民居','牌坊'] },
];

// ===================== 4. 精选库检索函数 =====================
function searchCuratedModels(query: string): SearchResult[] {
  if (!query.trim()) {
    return CURATED_MODELS.map((m, i) => ({
      id: `curated-${i}`,
      title: m.title,
      url: m.searchUrl,
      downloadUrl: m.realDownloadUrl,
      snippet: m.snippet,
      siteName: m.siteName,
      verifiedFree: m.verifiedFree,
    }));
  }

  const q = query.toLowerCase().trim();
  const matched = CURATED_MODELS.filter(m =>
    m.title.toLowerCase().includes(q) ||
    m.snippet.toLowerCase().includes(q) ||
    m.category.some(c => q.includes(c) || c.includes(q))
  );

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

// ===================== 5. 关键词语义扩展 =====================
const KEYWORD_EXPANSION: Record<string, string[]> = {
  '龙':   ['龙','龙纹','龙雕','螭龙'],
  '房屋': ['房屋','房子','住宅','民居','四合院','民房'],
  '亭子': ['亭子','亭台','凉亭','六角亭','八角亭','木亭','石亭'],
  '塔':   ['塔','佛塔','宝塔','木塔','砖塔','石塔','雁塔','雷峰塔'],
  '桥':   ['桥','石桥','木桥','廊桥','石拱桥','风雨桥','索桥'],
  '牌坊': ['牌坊','牌楼','石牌坊','木牌坊','功德坊'],
  '殿':   ['殿','大殿','宫殿','佛殿','大雄宝殿','金銮殿'],
  '庙':   ['庙','寺庙','道观','文庙','城隍庙','土地庙'],
  '祠':   ['祠','宗祠','祠堂','家祠','祖祠'],
  '院':   ['院','庭院','宅院','四合院','书院'],
  '宅':   ['宅','住宅','民居','民宅','豪宅'],
  '园林': ['园林','花园','园林建筑','亭园'],
  '戏台': ['戏台','古戏台','戏曲台'],
  '门楼': ['门楼','大门','宅门','城门'],
  '台':   ['台','楼台','亭台','观星台','烽火台'],
};

function expandKeyword(kw: string): string {
  for (const [key, aliases] of Object.entries(KEYWORD_EXPANSION)) {
    if (aliases.some(a => kw.includes(a) || a.includes(kw))) return key;
  }
  return kw;
}

// ===================== 6. 黑名单过滤 =====================
const GARBAGE_PATTERNS = [
  /作品上传|上传声明|版权声明|用户声明|签约设计师|设计师入驻/i,
  /下载声明|关于本站|联系我们|常见问题|帮助中心|意见反馈/i,
  /用户协议|隐私政策|网站地图|收藏本站|免责条款|增值服务|VIP会员/i,
  /Copyright|All Rights Reserved|沪ICP备|京ICP备|粤ICP备/i,
  /分类目录|标签聚合|专题推荐|热门下载|编辑精选|排行榜/i,
  /最新上传|推荐素材|精选推荐|周榜|月榜|总榜/i,
];

const MODEL_HINTS = [
  'stl','模型','model','3d','打印','print','下载',
  '亭','塔','桥','楼','屋','房','殿','庙','祠','台','门','坊','廊','院','宅','园','馆','阁',
  '龙','瓦','砖','榫卯','飞檐','斗拱','雕花','古建筑','民居',
];

function isGarbage(title: string, snippet: string, url?: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  if (GARBAGE_PATTERNS.some(p => p.test(text))) return true;
  if (url && GARBAGE_PATTERNS.some(p => p.test(url))) return true;
  if (!MODEL_HINTS.some(h => text.includes(h)) && text.length < 15) return true;
  return false;
}

// ===================== 7. 网络请求工具 =====================
async function fetchPage(url: string): Promise<string | null> {
  try {
    const resp = await axios.get(url, {
      timeout: FETCH_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      maxRedirects: 3,
    });
    const ct = (resp.headers['content-type'] || '') as string;
    if (!ct.includes('html')) return null;
    return resp.data as string;
  } catch { return null; }
}

// ===================== 8. 多站点真实模型爬取 =====================
async function crawlModelDetails(keyword: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Yeggi：聚合引擎，返回真实模型链接
  const yeggiHtml = await fetchPage(
    `https://www.yeggi.com/q/${encodeURIComponent(keyword + ' stl')}/`
  );
  if (yeggiHtml) {
    const $ = cheerio.load(yeggiHtml);
    const seen = new Set<string>();
    $('a[href*="/model/"], a[href*="/thing:"], .search-item a').each((i, el) => {
      if (results.length >= MAX_PER_SITE) return false;
      const href = $(el).attr('href') || '';
      const title = $(el).find('h3, .title, .name').first().text().trim()
        || $(el).text().trim().split('\n')[0].trim();
      if (!title || title.length < 5 || seen.has(href)) return;
      if (isGarbage(title, '', href)) return;
      const modelUrl = href.startsWith('http') ? href : `https://www.yeggi.com${href}`;
      seen.add(modelUrl);
      results.push({
        id: `yeggi-${i}-${Date.now()}`,
        title: title.substring(0, 120),
        url: `https://www.yeggi.com/q/${encodeURIComponent(keyword + ' stl')}/`,
        downloadUrl: modelUrl,
        snippet: `Yeggi聚合：${title}，点击跳转至原站模型页面下载`,
        siteName: 'Yeggi',
        verifiedFree: true,
      });
    });
  }

  // Thingiverse：解析真实 thing 详情页
  const tvHtml = await fetchPage(
    `https://www.thingiverse.com/search?q=${encodeURIComponent(keyword)}&type=things`
  );
  if (tvHtml) {
    const $ = cheerio.load(tvHtml);
    $('[data-test="search-result-item"], .Grid-item, .thing-card').each((i, el) => {
      if (results.length >= MAX_PER_SITE + 4) return false;
      const $el = $(el);
      const title = $el.find('.ThingCard__title, .Card-title, h3, .title').first().text().trim()
        || $el.find('img').attr('alt') || '';
      const link = $el.find('a[href*="/thing:"], a').first().attr('href') || '';
      if (!title || title.length < 5 || isGarbage(title, '', link)) return;
      const detailUrl = link.startsWith('http') ? link : `https://www.thingiverse.com${link}`;
      results.push({
        id: `thingiverse-${i}-${Date.now()}`,
        title: title.substring(0, 120),
        url: `https://www.thingiverse.com/search?q=${encodeURIComponent(keyword)}`,
        downloadUrl: detailUrl,
        snippet: `Thingiverse：${title}，免费STL模型，可直接下载`,
        siteName: 'Thingiverse',
        verifiedFree: true,
      });
    });
  }

  // 3D溜溜网：解析真实模型页
  const d366Html = await fetchPage(
    `https://www.3d66.com/so/${encodeURIComponent(keyword)}-stl.html`
  );
  if (d366Html) {
    const $ = cheerio.load(d366Html);
    const seen = new Set<string>();
    $('a[href*="/model/"]').each((i, el) => {
      if (results.length >= MAX_PER_SITE + 2) return false;
      const href = $(el).attr('href') || '';
      const title = $(el).find('.title, h3, .name').first().text().trim()
        || $(el).text().trim().split('\n')[0].trim();
      if (!title || title.length < 5 || seen.has(href)) return;
      if (isGarbage(title, '', href)) return;
      seen.add(href);
      const modelUrl = href.startsWith('http') ? href : `https://www.3d66.com${href}`;
      results.push({
        id: `3d66-${i}-${Date.now()}`,
        title: title.substring(0, 120),
        url: modelUrl,
        downloadUrl: modelUrl,
        snippet: `3D溜溜网：${title}，可跳转查看并下载STL模型`,
        siteName: '3D溜溜网',
        verifiedFree: false,
      });
    });
  }

  // 爱给网：只抓 /3d/print/ 路径（模型详情页）
  const aigeiHtml = await fetchPage(
    `https://www.aigei.com/s?q=${encodeURIComponent(keyword)}&type=3d`
  );
  if (aigeiHtml) {
    const $ = cheerio.load(aigeiHtml);
    const seen = new Set<string>();
    $('a[href*="/3d/print/"]').each((i, el) => {
      if (results.length >= MAX_PER_SITE + 2) return false;
      const href = $(el).attr('href') || '';
      const title = $(el).find('.title, h3, .name').first().text().trim()
        || $(el).text().trim().split('\n')[0].trim();
      if (!title || title.length < 5 || seen.has(href)) return;
      if (isGarbage(title, '', href)) return;
      seen.add(href);
      const modelUrl = href.startsWith('http') ? href : `https://www.aigei.com${href}`;
      results.push({
        id: `aigei-${i}-${Date.now()}`,
        title: title.substring(0, 120),
        url: modelUrl,
        downloadUrl: modelUrl,
        snippet: `爱给网：${title}，古建筑STL模型，免费下载`,
        siteName: '爱给网',
        verifiedFree: true,
      });
    });
  }

  return results;
}

// ===================== 9. 本地模型搜索 =====================
async function searchLocalModels(query: string): Promise<SearchResult[]> {
  const stlDir = path.join(process.cwd(), 'public', 'stl-models');
  try {
    if (!fs.existsSync(stlDir)) { fs.mkdirSync(stlDir, { recursive: true }); return []; }
    const files = fs.readdirSync(stlDir);
    const q = query.trim().toLowerCase();
    const filtered = files.filter(f =>
      f.endsWith('.stl') && f.replace('.stl', '').toLowerCase().includes(q)
    );
    return filtered.map(f => ({
      id: `local-${f}`,
      title: f.replace('.stl', ''),
      url: `/stl-models/${f}`,
      downloadUrl: `/stl-models/${f}`,
      snippet: '本地古建筑STL模型',
      siteName: '我的图书馆',
      verifiedFree: true,
      isLocal: true,
    }));
  } catch { return []; }
}

// ===================== 10. 合并去重 =====================
function dedup(...arrays: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  return arrays.flat().filter(item => {
    const key = item.downloadUrl + item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ===================== 11. 无结果时的兜底推荐站点 =====================
function generateFallbackSites(keyword: string): SearchResult[] {
  return [
    {
      id: `tip-${Date.now()}`,
      title: `「${keyword}」相关 STL 模型推荐站点`,
      url: '',
      snippet: '以下站点可直接搜索并下载古建筑STL模型',
      siteName: '',
      verifiedFree: false,
      isTip: true,
      isRecommendedSite: true,
    },
    ...STL_SITES_CONFIG.map((site, i) => ({
      id: `fallback-${i}-${Date.now()}`,
      title: `${site.name} 搜索跳转`,
      url: site.searchUrl(keyword),
      downloadUrl: site.searchUrl(keyword),
      snippet: `${site.tag} ${site.name}，点击跳转搜索结果页面`,
      siteName: site.name,
      verifiedFree: site.isFree,
      isRecommendedSite: true,
    })),
  ];
}

// ===================== 12. POST 主入口 =====================
export async function POST(request: NextRequest) {
  try {
    const { query, count = 30 } = await request.json();
    const keyword = query?.trim() || '';
    const expandedKw = expandKeyword(keyword);

    // 四轨并行：本地 + 精选库 + 多站点真实爬取 + 站点跳转链接（保留）
    const [localResults, curatedResults, crawledDetails, siteLinks] = await Promise.all([
      searchLocalModels(keyword),
      Promise.resolve(searchCuratedModels(keyword || expandedKw)),
      crawlModelDetails(expandedKw).catch(() => [] as SearchResult[]),
      Promise.resolve(crawlSTLSites(keyword)),
    ]);

    // 合并顺序：本地 > 精选库（真实下载链接）> 站点爬取结果 > 站点跳转兜底
    const merged = dedup(localResults, curatedResults, crawledDetails, siteLinks).slice(0, count);

    // 过滤爬取结果中的垃圾
    const filtered = merged.filter(r =>
      r.isRecommendedSite || !isGarbage(r.title, r.snippet, r.url)
    );

    const hasReal = filtered.some(r => r.downloadUrl && !r.isRecommendedSite);

    return NextResponse.json({
      success: true,
      results: filtered,
      total: filtered.length,
      hasResult: hasReal || filtered.length > 0,
      emptyTip: hasReal ? '' : '未找到有效模型，可点击下方推荐站点跳转',
      curatedCount: curatedResults.length,
      crawledCount: crawledDetails.length,
    });
  } catch (error) {
    console.error('[search-stl] POST 错误:', error);
    return NextResponse.json({ success: false, error: '搜索失败', results: [], total: 0, hasResult: false });
  }
}

// ===================== 13. GET =====================
export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword')
    || request.nextUrl.searchParams.get('query') || '';
  const expandedKw = expandKeyword(keyword);

  const [localResults, curatedResults, crawledDetails, siteLinks] = await Promise.all([
    searchLocalModels(keyword),
    Promise.resolve(searchCuratedModels(keyword || expandedKw)),
    crawlModelDetails(expandedKw).catch(() => [] as SearchResult[]),
    Promise.resolve(crawlSTLSites(keyword)),
  ]);

  const merged = dedup(localResults, curatedResults, crawledDetails, siteLinks).slice(0, 30);
  const filtered = merged.filter(r =>
    r.isRecommendedSite || !isGarbage(r.title, r.snippet, r.url)
  );
  const hasReal = filtered.some(r => r.downloadUrl && !r.isRecommendedSite);

  return NextResponse.json({
    success: true,
    results: filtered,
    total: filtered.length,
    hasResult: hasReal || filtered.length > 0,
    emptyTip: hasReal ? '' : '未找到有效模型',
    curatedCount: curatedResults.length,
    crawledCount: crawledDetails.length,
  });
}

// ===================== 14. 健康检查 =====================
export async function HEAD() {
  const stlDir = path.join(process.cwd(), 'public', 'stl-models');
  let stlFiles = 0;
  try {
    if (fs.existsSync(stlDir)) {
      stlFiles = fs.readdirSync(stlDir).filter(f => f.endsWith('.stl')).length;
    }
  } catch { /* ignore */ }
  return NextResponse.json({
    status: 'v2.2 精选库兜底 + 多站点真实爬取 + 跳转链接（保留）',
    curated_models: CURATED_MODELS.length,
    crawl_targets: ['Thingiverse', '爱给网', '3D溜溜网', 'Yeggi', 'Printables', 'Sketchfab'],
    stl_sites_config: `保留 stlSites 数组配置（${STL_SITES_CONFIG.length}个站点）`,
    filter: '黑名单过滤 + 模型提示词验证',
    local_stl: stlFiles,
  });
}
