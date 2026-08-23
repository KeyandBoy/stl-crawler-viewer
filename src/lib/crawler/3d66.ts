// 3D66 爬虫：阿里云 WAF（acw_sc__v2 JS 验证）绕过 + /api/v1/res/list 搜索接口
import axios from 'axios';
import { JSDOM, VirtualConsole } from 'jsdom';
import { crawlRequest } from '@/lib/crawler/http';
import type { SiteHit } from '@/lib/crawler/sites';

interface Session {
  acwTc: string;
  acwSc: string;
  expire: number;
}

// WAF cookie 有效 1 小时，缓存 30 分钟（同一会话所有搜索复用）
let session: Session | null = null;
const SESSION_TTL = 30 * 60 * 1000;

// WAF 失败缓存：失败后 5 分钟内不再重试（避免每个变体白等 6s）
let lastFailTime = 0;
const FAIL_COOLDOWN = 5 * 60 * 1000;

/** 在 jsdom 完整浏览器环境中执行混淆 JS，解出 acw_sc__v2 */
function solveAcwCookie(html: string, url: string): string {
  const match = html.match(/<textarea id="renderData"[^>]*>([\s\S]*?)<\/textarea>/);
  if (!match) return '';
  const virtualConsole = new VirtualConsole(); // 静默 jsdom 噪音日志
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const dom = new JSDOM(html, {
    url,
    referrer: 'https://3d.3d66.com/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window.navigator, 'userAgent', { get: () => UA, configurable: true });
    },
  });
  const cookie = dom.window.document.cookie;
  const m = cookie.match(/acw_sc__v2=([^;]+)/);
  dom.window.close();
  return m ? m[1] : '';
}

/** 获取（或缓存）3D66 WAF 会话：首次需要 GET 页面触发验证并解 cookie */
async function getSession(searchUrl: string): Promise<Session | null> {
  if (session && Date.now() < session.expire) return session;
  // 失败冷却期内直接跳过，避免每个变体都白等
  if (Date.now() - lastFailTime < FAIL_COOLDOWN) {
    console.log('[3d66] WAF 会话冷却中，跳过');
    return null;
  }
  try {
    const { data, headers } = await crawlRequest(searchUrl, '3d66', { maxRetries: 0, timeout: 6000 });
    const html = typeof data === 'string' ? data : '';
    const acwSc = html.includes('renderData') ? solveAcwCookie(html, searchUrl) : '';
    if (!acwSc) {
      lastFailTime = Date.now();
      console.warn('[3d66] WAF 会话解析失败（无 renderData）');
      return null;
    }
    const acwTc = (() => {
      const sc = (headers as Record<string, unknown>)?.['set-cookie'];
      if (Array.isArray(sc)) return sc.map((c) => String(c).split(';')[0]).find((c) => c.startsWith('acw_tc')) || '';
      if (typeof sc === 'string') return sc.split(';')[0].startsWith('acw_tc') ? sc.split(';')[0] : '';
      return '';
    })();
    session = { acwTc: acwTc || '', acwSc, expire: Date.now() + SESSION_TTL };
    console.log('[3d66] WAF 会话获取成功');
    return session;
  } catch (e) {
    lastFailTime = Date.now();
    console.warn('[3d66] 获取 WAF 会话失败:', e instanceof Error ? e.message : e);
    return null;
  }
}

interface ResListResult {
  res_name?: string;
  res_price?: number;
  hrefUrl?: string;
  thuimg324?: string;
  detail_url_alias?: string;
}

/** 搜索 3D66 模型库（付费模型，结果用于跳转原站下载） */
export async function search3d66(keyword: string): Promise<SiteHit[]> {
  const pageUrl = `https://3d.3d66.com/model/${encodeURIComponent(keyword)}_1.html?sws=1`;
  const sess = await getSession(pageUrl);
  if (!sess) return [];

  try {
    const body = new URLSearchParams({
      now: pageUrl,
      layout_type: '2',
      limit: '60',
      page: '1',
      is_all_search: '2',
      refer_url: 'https://3d.3d66.com/',
      search_word_source: '1',
      search_word: keyword,
      site: '0',
      page_type: '0',
      access_source_site: '0',
      access_source_page: '0',
      browser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
      replenish: '0',
      per_total: '0',
    });

    const payload = await postJson(body, pageUrl, sess);
    const list = payload?.data?.list as ResListResult[] | undefined;
    const dataObj = payload?.data as Record<string, unknown> | undefined;
    const totalCount = dataObj?.total_count ?? dataObj?.count ?? (payload as Record<string, unknown>)?.total_count;
    console.log(`[3d66] 搜索结果 keyword="${keyword}" listLen=${Array.isArray(list) ? list.length : 0} totalCount=${totalCount}`);
    if (!Array.isArray(list)) return [];

    const hits: SiteHit[] = [];
    for (const item of list) {
      const alias = item.detail_url_alias || '';
      const name = (item.res_name || '').trim();
      if (!alias || name.length < 3) continue;
      hits.push({
        id: `3d66-${alias}`,
        title: name,
        detailUrl: item.hrefUrl || `https://3d.3d66.com/model/${encodeURIComponent(keyword)}_1.html?sws=1`,
        siteName: '3D溜溜网',
        siteId: '3d66',
        snippet: `3D溜溜网：${name}（付费模型）`,
        thumbnail: item.thuimg324 || undefined,
      });
    }
    console.log(`[3d66] 解析到 ${hits.length} 条有效结果`);
    return hits.slice(0, 10);
  } catch (e) {
    console.warn('[3d66] 搜索失败:', e instanceof Error ? e.message : e);
    return [];
  }
}

async function postJson(body: URLSearchParams, pageUrl: string, sess: Session): Promise<{ data?: { list?: unknown } } | null> {
  const resp = await axios.post('https://3d.3d66.com/api/v1/res/list', body.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': pageUrl,
      'Cookie': `${sess.acwTc}; acw_sc__v2=${sess.acwSc}`,
    },
    timeout: 6000,
    validateStatus: () => true,
  });
  return typeof resp.data === 'string' ? null : (resp.data as { data?: { list?: unknown } });
}
