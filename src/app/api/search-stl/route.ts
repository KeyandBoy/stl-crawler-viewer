import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { crawlRequest } from '@/lib/crawler/http';
import { parseAigeiSearch } from '@/lib/crawler/sites';
import { search3d66 } from '@/lib/crawler/3d66';
import { makeDisplayFilename, readLibraryMetadata } from '@/lib/libraryMetadata';
import { getKeywordVariants, sitePrefersEnglish } from '@/lib/providers/keywords';
import { getSearchableProviders } from '@/lib/providers/registry';
import { resultPriority } from '@/lib/libraryRules';
import type { ModelSearchResult } from '@/lib/providers/types';

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  downloadUrl?: string;
  snippet: string;
  siteName: string;
  verifiedFree: boolean;
  resultKind?: 'model' | 'search_suggestion' | 'tip';
  isRecommendedSite?: boolean;
  isLocal?: boolean;
  isTip?: boolean;
  thumbnail?: string;
  publishTime?: string;
  downloadMode?: 'direct' | 'detail' | 'login_required' | 'external_search' | 'paid' | 'resolve';
  requiresLogin?: boolean;
  canDirectDownload?: boolean;
  downloadHint?: string;
  sourceDetailUrl?: string;
  sourceSearchUrl?: string;
  isRealDetailPage?: boolean;
  siteId?: string;
}

function buildSiteSearchUrl(siteName: string, keyword: string): string {
  const kw = encodeURIComponent(`${keyword} stl`);
  switch (siteName) {
    case '爱给网': return `https://www.aigei.com/s?q=${kw}&type=3d`;
    case '3D溜溜网': return `https://3d.3d66.com/model/${kw}_1.html?sws=1`;
    case 'Yeggi': return `https://www.yeggi.com/q/${kw}/`;
    case 'Thingiverse': return `https://www.thingiverse.com/search?q=${kw}&type=things&sort=relevant`;
    case 'Printables': return `https://www.printables.com/search/models?q=${kw}`;
    case 'Sketchfab': return `https://sketchfab.com/search?q=${kw}&type=models`;
    default: return '';
  }
}

const GARBAGE_PATTERNS = [
  /作品上传|上传声明|版权声明|用户声明|签约设计师|设计师入驻/i,
  /下载声明|关于本站|联系我们|常见问题|帮助中心|意见反馈/i,
  /用户协议|隐私政策|网站地图|收藏本站|免责条款|增值服务|VIP会员/i,
  /Copyright|All Rights Reserved|沪ICP备|京ICP备|粤ICP备/i,
  /分类目录|标签聚合|专题推荐|热门下载|编辑精选|排行榜/i,
];
function isGarbage(title: string, snippet: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  return GARBAGE_PATTERNS.some(p => p.test(text));
}
function providerToFrontend(r: ModelSearchResult): SearchResult {
  const siteNameMap: Record<string, string> = { thingiverse: 'Thingiverse', printables: 'Printables' };
  const siteName = siteNameMap[r.provider] || r.provider;
  let downloadMode: SearchResult['downloadMode'];
  if (r.downloadCapability === 'direct_file') downloadMode = 'direct';
  else if (r.downloadCapability === 'resolve_detail') downloadMode = 'resolve';
  else if (r.downloadCapability === 'browser_click') downloadMode = 'login_required';
  else downloadMode = 'external_search';
  return {
    id: r.id, title: r.title, url: r.detailUrl || r.searchUrl || '',
    downloadUrl: r.files?.[0]?.url, snippet: r.description || '', siteName,
    verifiedFree: r.access === 'free', resultKind: r.resultKind, thumbnail: r.thumbnail,
    downloadMode, requiresLogin: r.requiresLogin,
    canDirectDownload: r.resolution === 'resolved' && !!r.files?.length,
    downloadHint: r.resolution === 'resolved' ? `${siteName} 已解析到 ${r.files?.length || 0} 个文件` : undefined,
    sourceDetailUrl: r.detailUrl, sourceSearchUrl: r.searchUrl,
    isRealDetailPage: r.resultKind === 'model', siteId: r.provider,
  };
}

async function searchViaProviders(keyword: string, maxResults: number, hasAgentToken = false): Promise<SearchResult[]> {
  const providers = getSearchableProviders();
  // 无 Agent Token 时跳过 HTTP 必失败的站点（Thingiverse 是 React SPA、Printables 被 Cloudflare 拦截）
  const filtered = hasAgentToken ? providers : providers.filter(p => !['thingiverse', 'printables'].includes(p.id));
  if (filtered.length === 0) return [];
  console.log(`[provider] 开始搜索 keyword="${keyword}" providers=${filtered.map(p=>p.id).join(',')}`);
  const tasks = filtered.map(async (provider) => {
    const preferEn = sitePrefersEnglish(provider.id);
    const variants = getKeywordVariants(keyword, preferEn).slice(0, 3);
    try {
      const providerResults = await provider.search({ keyword, variants, maxResults: Math.min(maxResults, 6), timeout: 12000 });
      console.log(`[provider:${provider.id}] 返回 ${providerResults.length} 条`);
      return providerResults.map(providerToFrontend);
    } catch (e) {
      console.error(`[provider:${provider.id}] 搜索失败:`, e instanceof Error ? e.message : e);
      return [] as SearchResult[];
    }
  });
  const all = await Promise.all(tasks);
  return all.flat();
}

async function search3D66Legacy(keyword: string): Promise<SearchResult[]> {
  try {
    console.log(`[3d66] 搜索 keyword="${keyword}"`);
    const hits = await search3d66(keyword);
    console.log(`[3d66] 返回 ${hits.length} 条`);
    return hits.slice(0, 6).map((hit, i) => ({
      id: hit.id || `3d66-${i}-${Date.now()}`, title: hit.title, url: hit.detailUrl,
      snippet: `3D溜溜网：${hit.title}`, siteName: '3D溜溜网', verifiedFree: false,
      resultKind: 'model' as const, downloadMode: 'paid' as const,
      downloadHint: '付费模型，点击跳转原站', sourceDetailUrl: hit.detailUrl,
      sourceSearchUrl: hit.detailUrl, isRealDetailPage: true, siteId: '3d66',
    }));
  } catch { return []; }
}

async function searchAigeiLegacy(keyword: string): Promise<SearchResult[]> {
  try {
    console.log(`[aigei] 搜索 keyword="${keyword}"`);
    const url = `https://www.aigei.com/s?q=${encodeURIComponent(keyword)}&type=3d`;
    const { data, status } = await crawlRequest(url, 'aigei', { maxRetries: 0, timeout: 6000 });
    console.log(`[aigei] status=${status} dataLen=${typeof data === 'string' ? data.length : 'N/A'}`);
    if (status >= 400 || typeof data !== 'string') return [];
    const parsed = parseAigeiSearch(String(data));
    console.log(`[aigei] 解析到 ${parsed.length} 条`);
    return parsed.slice(0, 6).map(hit => ({
      id: hit.id, title: hit.title, url: hit.detailUrl, snippet: `爱给网：${hit.title}`,
      siteName: '爱给网', verifiedFree: false, resultKind: 'model' as const,
      downloadMode: 'resolve' as const, downloadHint: '点击后自动解析详情页',
      sourceDetailUrl: hit.detailUrl, sourceSearchUrl: url, isRealDetailPage: true, siteId: 'aigei',
    }));
  } catch (e) {
    console.error(`[aigei] 搜索异常 keyword="${keyword}":`, e instanceof Error ? e.message : e);
    return [];
  }
}

async function searchYeggiLegacy(keyword: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const url = `https://www.yeggi.com/q/${encodeURIComponent(keyword + ' stl')}/`;
    console.log(`[yeggi] 搜索 url="${url}"`);
    const { data, status } = await crawlRequest(url, 'yeggi', { maxRetries: 0, timeout: 6000 });
    console.log(`[yeggi] status=${status} dataLen=${typeof data === 'string' ? data.length : 'N/A'}`);
    if (status >= 400 || typeof data !== 'string') return results;
    const $ = cheerio.load(data);
    const seen = new Set<string>();
    $('a[href*="/model/"], a[href*="thingiverse"], a[href*="printables"], a[href*="cults"]').each((i, el) => {
      if (results.length >= 6) return false;
      const href = $(el).attr('href') || '';
      if (seen.has(href) || !href) return;
      const title = $(el).find('h3, [class*="title"], [class*="name"]').first().text().trim()
        || $(el).text().trim().split('\n')[0].trim();
      if (!title || title.length < 3 || isGarbage(title, '')) return;
      seen.add(href);
      const modelUrl = href.startsWith('http') ? href : `https://www.yeggi.com${href}`;
      results.push({
        id: `yeggi-${i}-${Date.now()}`, title: title.substring(0, 100),
        url: `https://www.yeggi.com/q/${encodeURIComponent(keyword + ' stl')}/`,
        downloadUrl: modelUrl, snippet: `Yeggi聚合：${title}`, siteName: 'Yeggi',
        verifiedFree: false, resultKind: 'search_suggestion', downloadMode: 'external_search',
        sourceSearchUrl: modelUrl, sourceDetailUrl: modelUrl, siteId: 'yeggi',
      });
    });
  } catch (e) {
    console.error(`[yeggi] 搜索异常 keyword="${keyword}":`, e instanceof Error ? e.message : e);
  }
  return results;
}
async function searchLocalModels(query: string): Promise<SearchResult[]> {
  const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
  const USE_BLOB = !!BLOB_TOKEN;
  const q = query.trim().toLowerCase();

  if (USE_BLOB) {
    try {
      const { list } = await import('@vercel/blob');
      const metadata = await readLibraryMetadata();
      const metaByKey = new Map(metadata.items.filter(i => i.status === 'approved').map(i => [i.key, i]));
      const { blobs } = await list({ prefix: 'stl-models/', token: BLOB_TOKEN });
      return blobs.filter(b => b.pathname.toLowerCase().endsWith('.stl')).filter(f => {
        const key = f.pathname.replace('stl-models/', '');
        const name = (metaByKey.get(key) ? makeDisplayFilename(metaByKey.get(key)!) : f.pathname.split('/').pop() || '').replace(/\.stl$/i, '');
        return name.toLowerCase().includes(q);
      }).map(f => {
        const key = f.pathname.replace('stl-models/', '');
        const meta = metaByKey.get(key);
        const filename = meta ? makeDisplayFilename(meta) : f.pathname.split('/').pop() || '';
        return {
          id: `blob-${key}`, title: filename.replace('.stl', ''), url: f.url, downloadUrl: f.url,
          snippet: 'Vercel Blob 本地模型库', siteName: '我的图书馆', verifiedFree: true,
          resultKind: 'model' as const, isLocal: true, isRealDetailPage: false,
          downloadMode: 'direct' as const, canDirectDownload: true, downloadHint: '本地模型，可直接下载',
        };
      });
    } catch { return []; }
  }

  const stlDir = path.join(process.cwd(), 'public', 'stl-models');
  try {
    if (!fs.existsSync(stlDir)) { fs.mkdirSync(stlDir, { recursive: true }); return []; }
    const files = fs.readdirSync(stlDir);
    const metadata = await readLibraryMetadata();
    const metaByKey = new Map(metadata.items.filter(i => i.status === 'approved').map(i => [i.key, i]));
    return files.filter(f => f.toLowerCase().endsWith('.stl')).filter(f => {
      const name = (metaByKey.get(f) ? makeDisplayFilename(metaByKey.get(f)!) : f).replace(/\.stl$/i, '').toLowerCase();
      return name.includes(q);
    }).map(f => {
      const meta = metaByKey.get(f);
      const filename = meta ? makeDisplayFilename(meta) : f;
      return {
        id: `local-${f}`, title: filename.replace('.stl', ''), url: `/stl-models/${f}`,
        downloadUrl: `/stl-models/${f}`, snippet: '本地STL模型', siteName: '我的图书馆',
        verifiedFree: true, resultKind: 'model' as const, isLocal: true, isRealDetailPage: false,
        downloadMode: 'direct' as const, canDirectDownload: true, downloadHint: '本地模型，可直接下载',
      };
    });
  } catch { return []; }
}

function dedup(...arrays: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  return arrays.flat().filter(item => {
    const key = (item.downloadUrl || item.url) + item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortResults(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => resultPriority(a) - resultPriority(b));
}

const FALLBACK_SITES: Array<{ siteId: string; siteName: string; searchUrlFn: (kw: string) => string }> = [
  { siteId: 'thingiverse', siteName: 'Thingiverse', searchUrlFn: (kw) => `https://www.thingiverse.com/search?q=${encodeURIComponent(kw + ' stl')}&type=things` },
  { siteId: 'printables', siteName: 'Printables', searchUrlFn: (kw) => `https://www.printables.com/search/models?q=${encodeURIComponent(kw + ' stl')}` },
  { siteId: 'yeggi', siteName: 'Yeggi', searchUrlFn: (kw) => `https://www.yeggi.com/q/${encodeURIComponent(kw + ' stl')}/` },
  { siteId: '3d66', siteName: '3D溜溜网', searchUrlFn: (kw) => `https://3d.3d66.com/model/${encodeURIComponent(kw)}_1.html?sws=1` },
];

function buildFallbackCards(keyword: string, existingSiteIds: Set<string>): SearchResult[] {
  return FALLBACK_SITES
    .filter(s => !existingSiteIds.has(s.siteId))
    .map(s => ({
      id: `fallback-${s.siteId}-${keyword}`,
      title: `在 ${s.siteName} 搜索"${keyword}"`,
      url: s.searchUrlFn(keyword),
      snippet: `${s.siteName} 站内搜索，点击查看完整结果`,
      siteName: s.siteName,
      verifiedFree: false,
      resultKind: 'model' as const,
      downloadMode: 'external_search' as const,
      isRecommendedSite: true,
      siteId: s.siteId,
      sourceSearchUrl: s.searchUrlFn(keyword),
    }));
}

function finalize(keyword: string, merged: SearchResult[], crawledCount: number, cached = false, full = false, sourceStats?: Record<string, number>) {
  const sorted = sortResults(merged);
  const resultsWithMode = sorted.map(r => ({
    ...r,
    sourceSearchUrl: r.sourceSearchUrl || buildSiteSearchUrl(r.siteName, keyword) || undefined,
  }));
  const modelCount = resultsWithMode.filter(r => r.resultKind === 'model').length;
  const suggestionCount = resultsWithMode.filter(r => r.resultKind === 'search_suggestion').length;
  return {
    success: true, results: resultsWithMode, total: resultsWithMode.length,
    hasResult: modelCount > 0, searchKeyword: keyword,
    emptyTip: modelCount > 0 ? '' : '未找到可直接下载的模型，可点击推荐站点跳转原站搜索',
    crawledCount, cached, full, modelCount, suggestionCount,
    ...(sourceStats ? { sourceStats } : {}),
  };
}

async function runFast(keyword: string, count: number) {
  const [localResults] = await Promise.all([searchLocalModels(keyword)]);
  return { results: dedup(localResults).slice(0, count) };
}

async function runDeep(keyword: string, count: number, excludeUrls: Set<string>, hasAgentToken = false) {
  const allVariants = getKeywordVariants(keyword);
  const variants = allVariants.slice(0, 3); // 每源最多 3 个变体，防止并发爆炸
  console.log(`[runDeep] keyword="${keyword}" variants=${variants.length}/${allVariants.length} [${variants.join(',')}]`);

  const sourceStats: Record<string, number> = { aigei: 0, yeggi: 0, '3d66': 0 };
  const allBatches: SearchResult[][] = [];

  // 分批串行，每批 2 个变体（40 并发 → ~6 并发）
  const BATCH_SIZE = 2;
  for (let i = 0; i < variants.length; i += BATCH_SIZE) {
    const batch = variants.slice(i, i + BATCH_SIZE);
    const batchIdx = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(variants.length / BATCH_SIZE);
    console.log(`[runDeep] 批次 ${batchIdx}/${totalBatches}: [${batch.join(',')}]`);

    const batchResults = await Promise.all(batch.map(async variant => {
      const [providerResults, legacyResults] = await Promise.all([
        searchViaProviders(variant, 10, hasAgentToken),
        Promise.all([
          search3D66Legacy(variant),
          searchAigeiLegacy(variant),
          searchYeggiLegacy(variant),
        ]).then(r => r.flat()),
      ]);
      return { providerResults, legacyResults };
    }));

    for (const { providerResults, legacyResults } of batchResults) {
      for (const r of providerResults) {
        if (r.siteId) sourceStats[r.siteId] = (sourceStats[r.siteId] || 0) + 1;
      }
      for (const r of legacyResults) {
        if (r.siteId) sourceStats[r.siteId] = (sourceStats[r.siteId] || 0) + 1;
      }
      allBatches.push([...providerResults, ...legacyResults]);
    }
  }

  const results = dedup(...allBatches).filter(r => !excludeUrls.has(r.downloadUrl || r.url));
  // 没有真实结果时，为没有返回结果的站点生成兜底搜索卡片
  if (results.length === 0) {
    const existingSiteIds = new Set(Object.keys(sourceStats).filter(k => sourceStats[k] > 0));
    const fallbacks = buildFallbackCards(keyword, existingSiteIds);
    console.log(`[runDeep] 无真实结果，生成 ${fallbacks.length} 个站点兜底卡片`);
    return { results: fallbacks, crawledCount: 0, sourceStats };
  }
  console.log(`[runDeep] 总计 ${results.length} 条去重结果`, sourceStats);
  return { results: sortResults(results).slice(0, count), crawledCount: results.length, sourceStats };
}

const AGENT_URL = process.env.BROWSER_AGENT_URL || 'http://127.0.0.1:18789';
const AGENT_TOKEN = process.env.BROWSER_AGENT_TOKEN || '';

async function searchViaAgent(keyword: string, excludeUrls: Set<string>, token?: string): Promise<SearchResult[]> {
  const agentToken = token || AGENT_TOKEN;
  if (!agentToken) return [];
  try {
    const res = await fetch(AGENT_URL + '/agent-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-token': agentToken },
      body: JSON.stringify({ keyword, sites: ['thingiverse', 'printables', 'yeggi'] }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.success || !Array.isArray(data.results)) return [];

    return data.results.map((r: any) => {
      const siteNameMap: Record<string, string> = {
        thingiverse: 'Thingiverse', printables: 'Printables', yeggi: 'Yeggi',
      };
      const siteName = siteNameMap[r.site] || r.site;
      const siteId = r.site || 'unknown';
      return {
        id: r.id || 'agent-' + Math.random(),
        title: r.title || '',
        url: r.detailUrl || '',
        downloadUrl: undefined,
        snippet: '[Browser Agent] ' + siteName + ': ' + (r.title || ''),
        siteName,
        verifiedFree: false,
        resultKind: 'model' as const,
        downloadMode: 'resolve' as const,
        downloadHint: 'Browser Agent 已解析，点击下载',
        sourceDetailUrl: r.detailUrl,
        sourceSearchUrl: r.detailUrl,
        isRealDetailPage: true,
        siteId,
        thumbnail: r.thumbnail,
      };
    });
  } catch (e) {
    console.error('[agent] 搜索失败:', e instanceof Error ? e.message : e);
    return [];
  }
}

async function runDeepWithAgent(keyword: string, count: number, excludeUrls: Set<string>, agentToken?: string) {
  const agentPromise = searchViaAgent(keyword, excludeUrls, agentToken);
  const legacyPromise = runDeep(keyword, count, excludeUrls, !!agentToken);
  const [agentResults, legacyResult] = await Promise.all([agentPromise, legacyPromise]);
  const combined = [...legacyResult.results, ...agentResults];
  const deduped = dedup(combined).filter(r => !excludeUrls.has(r.downloadUrl || r.url));
  console.log('[runDeepWithAgent] agent=' + agentResults.length + ' legacy=' + legacyResult.results.length + ' dedup=' + deduped.length);
  return { results: deduped.slice(0, count), crawledCount: deduped.length, sourceStats: legacyResult.sourceStats };
}

interface SearchCacheEntry { fast: SearchResult[]; deep: SearchResult[]; time: number; }
const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL = 10 * 60 * 1000;
const SEARCH_CACHE_MAX = 200;

function cacheKeyFn(kw: string): string { return kw.trim().toLowerCase(); }
function readCache(key: string): SearchCacheEntry | null {
  const e = searchCache.get(key);
  if (!e || Date.now() - e.time > SEARCH_CACHE_TTL) { searchCache.delete(key); return null; }
  e.time = Date.now(); return e;
}
function writeCache(key: string, patch: Partial<SearchCacheEntry>) {
  const e = searchCache.get(key);
  if (e) { Object.assign(e, patch, { time: Date.now() }); }
  else { searchCache.set(key, { fast: [], deep: [], time: Date.now(), ...patch }); }
  while (searchCache.size > SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest === undefined) break;
    searchCache.delete(oldest);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query, count = 30, phase = 'fast' } = await request.json();
    const keyword = query?.trim() || '';
    const key = cacheKeyFn(keyword);

    // Agent token: 优先从请求头获取（前端 localStorage），其次从环境变量
    const agentToken = request.headers.get('x-browser-agent-token') || AGENT_TOKEN;

    if (phase === 'deep') {
      const entry = readCache(key);
      if (entry?.deep && entry.deep.length > 0) {
        return NextResponse.json(finalize(keyword, entry.deep, entry.deep.length, true, true));
      }
      let fastResults: SearchResult[] = entry?.fast || [];
      if (fastResults.length === 0) {
        const fast = await runFast(keyword, count);
        fastResults = fast.results;
      }
      const excludeUrls = new Set(fastResults.map(r => r.downloadUrl || r.url));
      const hasAgentToken = !!(agentToken);
      const deepFn = hasAgentToken ? (k: string, c: number, e: Set<string>) => runDeepWithAgent(k, c, e, agentToken) : (k: string, c: number, e: Set<string>) => runDeep(k, c, e, false);
      const { results, crawledCount, sourceStats } = await deepFn(keyword, count, excludeUrls);
      writeCache(key, { fast: fastResults, deep: results });
      return NextResponse.json(finalize(keyword, results, crawledCount, false, false, sourceStats));
    }

    const entry = readCache(key);
    if (entry?.fast && entry.fast.length > 0) {
      if (entry.deep && entry.deep.length > 0) {
        const { results: freshFast } = await runFast(keyword, count);
        const merged = dedup(freshFast, entry.deep).slice(0, count);
        return NextResponse.json(finalize(keyword, merged, entry.deep.length, true, true));
      }
      return NextResponse.json(finalize(keyword, entry.fast, 0, true, false));
    }

    const { results } = await runFast(keyword, count);
    writeCache(key, { fast: results });
    return NextResponse.json(finalize(keyword, results, 0, false, false));
  } catch (error: any) {
    console.error('[search-stl] POST error:', error?.message, error?.stack);
    return NextResponse.json({ success: false, error: '搜索失败: ' + (error?.message || 'unknown'), results: [], total: 0, hasResult: false });
  }
}

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword') || request.nextUrl.searchParams.get('query') || '';
  try {
    const fast = await runFast(keyword, 30);
    const excludeUrls = new Set(fast.results.map(r => r.downloadUrl || r.url));
    const agentToken = request.headers.get('x-browser-agent-token') || AGENT_TOKEN;
    const hasAgentToken = !!(agentToken);
    const deepFn = hasAgentToken ? (k: string, c: number, e: Set<string>) => runDeepWithAgent(k, c, e, agentToken!) : (k: string, c: number, e: Set<string>) => runDeep(k, c, e, false);
    const deep = await deepFn(keyword, 30, excludeUrls);
    const merged = dedup(fast.results, deep.results).slice(0, 30);
    return NextResponse.json(finalize(keyword, merged, deep.crawledCount, false, false, deep.sourceStats));
  } catch (error) {
    console.error('[search-stl] GET error:', error);
    return NextResponse.json({ success: false, error: '搜索失败', results: [], total: 0, hasResult: false });
  }
}