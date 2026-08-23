import * as cheerio from 'cheerio';
import { crawlRequest, crawlSequential } from '@/lib/crawler/http';
import { getSiteCookie } from '@/lib/siteCookies';
import { KEY_THINGIVERSE_API_TOKEN } from '@/lib/siteConfig';

// ===================== 通用工具 =====================

const THINGIVERSE_API = 'https://api.thingiverse.com';

export interface SiteHit {
  id: string;
  title: string;
  detailUrl: string;
  siteName: string;
  siteId: string;
  snippet: string;
  thumbnail?: string;
}

function cleanTitle(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

function absUrl(base: string, href: string): string {
  if (!href) return '';
  try {
    return new URL(href, base).href;
  } catch {
    return href.startsWith('http') ? href : `https:${href}`;
  }
}

function errStatus(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status;
}

// ===================== Thingiverse =====================

/** 搜索页解析：兼容 SSR 锚点 + __NEXT_DATA__ JSON */
export function parseThingiverseSearch(html: string): SiteHit[] {
  const hits: SiteHit[] = [];
  const seen = new Set<string>();

  const $ = cheerio.load(html);

  // 方式一：锚点
  $('a[href*="/thing:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/thing:(\d+)/);
    const id = m?.[1];
    if (!id || seen.has(id)) return;
    const title = cleanTitle(
      $(el).attr('title') ||
        $(el).find('[class*="title"], h3, h4, span').first().text() ||
        $(el).text().split('\n')[0],
    );
    if (title.length < 3) return;
    seen.add(id);
    hits.push({
      id: `thingiverse-${id}`,
      title,
      detailUrl: `https://www.thingiverse.com/thing:${id}`,
      siteName: 'Thingiverse',
      siteId: 'thingiverse',
      snippet: `Thingiverse 免费 STL：${title}`,
      thumbnail: $(el).find('img').attr('src') || undefined,
    });
  });

  // 方式二：__NEXT_DATA__（Thingiverse 基于 Next.js）
  try {
    const script = $('script#__NEXT_DATA__').first().text();
    if (script) {
      const json = JSON.parse(script);
      const results = findThingsInJson(json);
      for (const t of results) {
        const tid = String(t.id);
        if (seen.has(tid) || hits.length >= 8) continue;
        seen.add(tid);
        hits.push({
          id: `thingiverse-${tid}`,
          title: cleanTitle(t.name || t.title || `Thingiverse 模型 #${tid}`),
          detailUrl: `https://www.thingiverse.com/thing:${tid}`,
          siteName: 'Thingiverse',
          siteId: 'thingiverse',
          snippet: `Thingiverse 免费 STL：${cleanTitle(t.name || t.title || '')}`,
          thumbnail: t.thumbnail || t.image || undefined,
        });
      }
    }
  } catch { /* ignore */ }

  return hits.slice(0, 8);
}

function findThingsInJson(node: unknown): Array<{ id: string | number; name?: string; title?: string; thumbnail?: string; image?: string }> {
  const out: Array<{ id: string | number; name?: string; title?: string; thumbnail?: string; image?: string }> = [];
  if (!node || typeof node !== 'object') return out;

  const obj = node as Record<string, unknown>;
  // 直接命中 thing 对象
  const thingId = obj.thingId as string | number | undefined;
  if (thingId && (obj.name || obj.title)) {
    out.push({ id: thingId, name: obj.name as string, title: obj.title as string, thumbnail: (obj.thumbnail as string) || (obj.image as string) });
  }
  if (Array.isArray(node)) {
    for (const item of node as unknown[]) out.push(...findThingsInJson(item));
    return out;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    // 常见字段名
    if (key === 'things' || key === 'results' || key === 'hits' || key === 'items' || key === 'data') {
      if (Array.isArray(val)) {
        for (const item of val as unknown[]) {
          const rec = item as Record<string, unknown>;
          const id = (rec.thingId ?? rec.id) as string | number | undefined;
          if (id && (rec.name || rec.title)) {
            out.push({ id, name: rec.name as string, title: rec.title as string, thumbnail: (rec.thumbnail as string) || (rec.image as string) });
          }
        }
      }
    }
    if (val && typeof val === 'object') out.push(...findThingsInJson(val));
  }
  return out;
}

/** Thingiverse 官方 API 搜索（需 API Token，无需 Cookie） */
export async function searchThingiverseApi(keyword: string): Promise<SiteHit[]> {
  const token = await getSiteCookie(KEY_THINGIVERSE_API_TOKEN);
  if (!token) return [];

  const { data } = await crawlRequest(
    `${THINGIVERSE_API}/search/things/${encodeURIComponent(keyword)}?type=things`,
    'thingiverse',
    {
      withCookies: false,
      maxRetries: 0,
      timeout: 10000,
      responseType: 'json',
      extraHeaders: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    },
  );

  const payload = data as { hits?: unknown[] } | null;
  const hits = payload?.hits ?? [];
  const out: SiteHit[] = [];
  for (const raw of hits) {
    const t = raw as Record<string, unknown>;
    const id = t.id as number | undefined;
    const name = String(t.name || '');
    if (!id || !name) continue;
    const thumb = (t.thumbnail as string) || ((t.default_image as Record<string, unknown>)?.thumb as string) || '';
    out.push({
      id: `thingiverse-${id}`,
      title: cleanTitle(name),
      detailUrl: `https://www.thingiverse.com/thing:${id}`,
      siteName: 'Thingiverse',
      siteId: 'thingiverse',
      snippet: `Thingiverse 官方 API：${cleanTitle(name)}`,
      thumbnail: thumb || undefined,
    });
  }
  return out.slice(0, 8);
}

/** Thingiverse 官方 API 解析文件直链（需 API Token） */
export async function resolveThingiverseApi(detailUrl: string): Promise<{ url: string; filename: string; hint: string } | null> {
  const token = await getSiteCookie(KEY_THINGIVERSE_API_TOKEN);
  if (!token) return null;

  const m = detailUrl.match(/thing:(\d+)/);
  const id = m?.[1];
  if (!id) return null;

  const { data } = await crawlRequest(
    `${THINGIVERSE_API}/things/${id}/files`,
    'thingiverse',
    {
      withCookies: false,
      maxRetries: 0,
      timeout: 10000,
      responseType: 'json',
      extraHeaders: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    },
  );

  const files = data as Array<Record<string, unknown>> | null;
  if (!Array.isArray(files) || files.length === 0) return null;

  // 优先选 STL，否则第一个文件
  const stl = files.find((f) => /\.stl$/i.test(String(f.name || '')));
  const file = stl || files[0];
  const dlUrl = (file.download_url as string) || (file.url as string) || '';
  if (!dlUrl) return null;

  return {
    url: dlUrl,
    filename: String(file.name || `thingiverse-${id}.zip`),
    hint: 'Thingiverse 官方 API 文件直链',
  };
}

/** Thingiverse 详情 → 尝试匿名 zip 打包下载（部分模型无需登录） */
export async function resolveThingiverse(detailUrl: string): Promise<{ url: string; filename: string; hint: string }> {
  const m = detailUrl.match(/thing:(\d+)/);
  const id = m?.[1];
  if (!id) throw new Error('无效的 Thingiverse 链接');
  const zipUrl = `https://www.thingiverse.com/thing:${id}/zip`;

  // 预检：流式请求只读响应头，不下载整个文件；HTML 响应说明被重定向到登录页
  try {
    const { data, status, headers } = await crawlRequest(zipUrl, 'thingiverse', {
      maxRetries: 0,
      timeout: 8000,
      responseType: 'stream',
    });
    const ct = (headers as Record<string, unknown>)['content-type'] as string | undefined;
    (data as { destroy?: () => void })?.destroy?.();
    if (status >= 400 || (ct && (ct.includes('text/html') || ct.includes('application/json')))) {
      throw new Error('需要登录');
    }
  } catch (e) {
    if (errStatus(e) === 403 || (e instanceof Error && e.message === '需要登录')) {
      throw new Error('该模型需登录 Thingiverse：可在「站点设置」配置 API Token 或 Cookie');
    }
    throw new Error('Thingiverse 下载接口不可用');
  }
  return { url: zipUrl, filename: `thingiverse-${id}.zip`, hint: 'Thingiverse 官方打包下载（全部文件）' };
}

// ===================== Printables =====================

export function parsePrintablesSearch(html: string): SiteHit[] {
  const hits: SiteHit[] = [];
  const seen = new Set<string>();
  const $ = cheerio.load(html);

  $('a[href*="/model/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/model\/(\d+)(\/|$)/);
    const id = m?.[1];
    if (!id || seen.has(id)) return;
    seen.add(id);
    const title = cleanTitle(
      $(el).attr('title') ||
        $(el).find('[class*="title"], h3, h4, span').first().text() ||
        $(el).find('img').attr('alt') ||
        `Printables 模型 #${id}`,
    );
    if (title.length < 3) return;
    hits.push({
      id: `printables-${id}`,
      title,
      detailUrl: absUrl('https://www.printables.com', href),
      siteName: 'Printables',
      siteId: 'printables',
      snippet: `Printables 免费 STL：${title}`,
      thumbnail: $(el).find('img').attr('src') || undefined,
    });
  });

  return hits.slice(0, 8);
}

/** 递归收集 JSON 中所有公开文件直链（Printables CDN 等） */
function collectFileUrls(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectFileUrls(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') {
      if (/(?:media|files)\.printables\.com/.test(v) && /\.(stl|3mf|obj|step|stp|zip)(\?|$)/i.test(v)) {
        out.push(v);
      } else if (/\.stl(\?|$)/i.test(v)) {
        out.push(v);
      }
    } else if (v && typeof v === 'object') {
      collectFileUrls(v, out);
    }
  }
}

/** 从网页 HTML 文本中提取公开文件直链 */
function extractFileUrls(html: string): string[] {
  const out: string[] = [];
  const re = /https?:\/\/[^'"\s<>]+?\.(?:stl|3mf|obj|step|stp)(?:\?[^'"\s<>]*)?/gi;
  const matches = html.match(re) || [];
  for (const u of matches) {
    if (/(?:media|files)\.printables\.com|down\.aigei\.com|thingiverse\.com\/download:/i.test(u)) out.push(u);
  }
  return out;
}

/** Printables 详情 → 优先找公开 CDN 直链（无需登录），失败退回官方 download 接口 */
export async function resolvePrintables(detailUrl: string): Promise<{ url: string; filename: string; hint: string }> {
  const m = detailUrl.match(/\/model\/(\d+)/);
  const id = m?.[1];
  if (!id) throw new Error('无效的 Printables 链接');

  // 1. 公开 CDN 直链（media.printables.com，无需登录）
  try {
    const { data } = await crawlRequest(detailUrl, 'printables', { maxRetries: 0, timeout: 10000 });
    const html = String(data);
    const urls = extractFileUrls(html);
    const $ = cheerio.load(html);
    const script = $('script#__NEXT_DATA__').first().text();
    if (script) {
      try {
        collectFileUrls(JSON.parse(script), urls);
      } catch { /* ignore */ }
    }
    $('a[href*="media.printables.com"], a[href*="files.printables.com"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (/\.(stl|3mf|obj|step|stp)(\?|$)/i.test(href)) urls.push(absUrl(detailUrl, href));
    });
    if (urls.length > 0) {
      const finalUrl = urls[0];
      return {
        url: finalUrl,
        filename: finalUrl.split('/').pop()?.split('?')[0] || `printables-${id}.stl`,
        hint: 'Printables 公开直链（无需登录）',
      };
    }
  } catch { /* 继续走登录接口 */ }

  // 2. 官方 download 接口（需登录 Cookie）
  const dlUrl = `https://www.printables.com/model/${id}/download`;
  try {
    const { status } = await crawlRequest(dlUrl, 'printables', { maxRetries: 0, timeout: 8000, responseType: 'arraybuffer' });
    if (status >= 400 && status !== 403) throw new Error(`下载接口返回 ${status}`);
  } catch (e) {
    const status = errStatus(e);
    if (status === 403 || status === 302 || status === 301) {
      throw new Error('该模型需登录 Printables：可在「站点设置」配置 Cookie（免费模型通常可走公开直链）');
    }
    throw new Error('Printables 下载接口不可用');
  }
  return { url: dlUrl, filename: `printables-${id}.zip`, hint: 'Printables 官方打包下载（需登录 Cookie）' };
}

// ===================== 爱给网 =====================

export function parseAigeiSearch(html: string): SiteHit[] {
  const hits: SiteHit[] = [];
  const seen = new Set<string>();
  const $ = cheerio.load(html);

  // 爱给网搜索结果使用 /item/ 链接
  $('a[href*="/item/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/item\/([^."]+)/);
    const id = m?.[1];
    if (!id || seen.has(id)) return;
    seen.add(id);
    const title = cleanTitle(
      $(el).attr('title') ||
        $(el).find('[class*="title"], h3, h4, [class*="name"], span').first().text() ||
        $(el).text().trim().split('\n')[0].trim() ||
        `爱给网模型 #${id}`,
    );
    if (title.length < 3 || title.length > 200) return;
    // 封面图提取：优先 img[src]，其次 data-original/data-src/data-lazy
    const $img = $(el).find('img').first();
    const thumbnail = $img.attr('src') || $img.attr('data-original') || $img.attr('data-src') || $img.attr('data-lazy') || undefined;
    hits.push({
      id: `aigei-${id}`,
      title,
      detailUrl: absUrl('https://www.aigei.com', href),
      siteName: '爱给网',
      siteId: 'aigei',
      snippet: `爱给网 STL：${title}`,
      thumbnail: thumbnail && !thumbnail.startsWith('data:') ? thumbnail : undefined,
    });
  });

  // 兜底：仍然支持旧的 /3d/print/ 链接
  if (hits.length === 0) {
    $('a[href*="/3d/print/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/3d\/print\/(\d+)/);
      const id = m?.[1];
      if (!id || seen.has(id)) return;
      seen.add(id);
      const title = cleanTitle(
        $(el).attr('title') ||
          $(el).find('[class*="title"], h3, h4, [class*="name"], span').first().text() ||
          `爱给网模型 #${id}`,
      );
      if (title.length < 3) return;
      hits.push({
        id: `aigei-${id}`,
        title,
        detailUrl: absUrl('https://www.aigei.com', href),
        siteName: '爱给网',
        siteId: 'aigei',
        snippet: `爱给网 STL：${title}`,
        thumbnail: $(el).find('img').attr('src') || $(el).find('img').attr('data-original') || undefined,
      });
    });
  }

  return hits.slice(0, 8);
}

/** 爱给网详情 → 找真实下载直链（免费模型通常无需登录） */
export async function resolveAigei(detailUrl: string): Promise<{ url: string; filename: string; hint: string }> {
  const { data } = await crawlRequest(detailUrl, 'aigei', { maxRetries: 0, timeout: 10000 });
  const $ = cheerio.load(String(data));
  const candidates: string[] = [];

  // 1. 直接文件链接
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/\.(stl|zip|obj|3mf|step|iges)(\?|#|$)/i.test(href)) {
      candidates.push(absUrl(detailUrl, href));
    }
    if (/down\.aigei\.com/i.test(href)) {
      candidates.push(absUrl(detailUrl, href));
    }
  });

  // 2. 下载按钮/接口
  $('a[href*="/download"], a[href*="/down"], button[data-url], [data-download-url]').each((_, el) => {
    const href = $(el).attr('href') || $(el).attr('data-url') || $(el).attr('data-download-url') || '';
    if (href) candidates.push(absUrl(detailUrl, href));
  });

  // 3. 内联脚本中的文件 URL
  const scripts = $('script').map((_, el) => $(el).html() || '').get();
  const scriptText = scripts.join('\n');
  const urlMatches = scriptText.match(/https?:\/\/[^'"\s]+?\.(?:stl|zip|obj|3mf)(?:\?[^'"\s]*)?/gi) || [];
  for (const u of urlMatches) candidates.push(u);

  if (candidates.length === 0) {
    throw new Error('爱给网详情页未找到下载链接（可能需要登录或为付费模型）');
  }
  const finalUrl = candidates[0];
  return {
    url: finalUrl,
    filename: finalUrl.split('/').pop()?.split('?')[0] || 'aigei-model.zip',
    hint: '爱给网直链',
  };
}

// ===================== 批量解析入口 =====================

export async function resolveSiteDetail(
  siteId: string,
  detailUrl: string,
): Promise<{ url: string; filename: string; hint: string }> {
  switch (siteId) {
    case 'thingiverse': {
      // 优先 API Token 方式（无需 Cookie），失败则退回 zip+cookie 方式
      try {
        const apiResult = await resolveThingiverseApi(detailUrl);
        if (apiResult) return apiResult;
      } catch (e) {
        console.warn('[resolveSiteDetail] Thingiverse API 解析失败，退回 zip 方式:', e instanceof Error ? e.message : e);
      }
      return resolveThingiverse(detailUrl);
    }
    case 'printables':
      return resolvePrintables(detailUrl);
    case 'aigei':
      return resolveAigei(detailUrl);
    default:
      throw new Error(`暂不支持该站点自动解析：${siteId}`);
  }
}

export async function resolveSiteDetailsSequential(
  items: Array<{ siteId: string; detailUrl: string }>,
): Promise<Map<string, { url: string; filename: string; hint: string }>> {
  const map = new Map<string, { url: string; filename: string; hint: string }>();
  await crawlSequential(items, async (item) => {
    try {
      const r = await resolveSiteDetail(item.siteId, item.detailUrl);
      map.set(item.detailUrl, r);
    } catch { /* 失败则跳过 */ }
  }, 800);
  return map;
}
