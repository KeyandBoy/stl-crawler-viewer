import express from 'express';
import crypto from 'crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const PORT = Number(process.env.BROWSER_AGENT_PORT || 18789);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',');

let pairingToken = crypto.randomBytes(32).toString('hex');
let pairedToken: string | null = null;
let browser: Browser | null = null;
let contexts = new Map<string, BrowserContext>();
let tasks = new Map<string, TaskState>();

interface TaskState {
  id: string;
  status: string;
  type: string;
  result?: unknown;
  error?: string;
  pageUrl?: string;
  createdAt: number;
}

interface SearchResult {
  id: string;
  title: string;
  detailUrl: string;
  thumbnail?: string;
  modelId?: string;
  site?: string;
}

interface FileResult {
  url: string;
  filename: string;
  format: string;
}

// ===================== Browser =====================

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });
  return browser;
}

async function getContext(siteId: string): Promise<BrowserContext> {
  const existing = contexts.get(siteId);
  if (existing) return existing;
  const b = await getBrowser();
  const profileDir = path.join(process.cwd(), 'browser-profile');
  const storagePath = path.join(profileDir, siteId + '-storage.json');
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    storageState: fs.existsSync(storagePath) ? storagePath : undefined,
  });
  contexts.set(siteId, ctx);
  return ctx;
}

async function saveStorage(siteId: string, ctx: BrowserContext): Promise<void> {
  try {
    const profileDir = path.join(process.cwd(), 'browser-profile');
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
    const state = await ctx.storageState();
    fs.writeFileSync(path.join(profileDir, siteId + '-storage.json'), JSON.stringify(state));
  } catch { /* ignore */ }
}

async function detectLoginPage(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const hasPwd = !!document.querySelector('input[type="password"]');
      const text = (document.body?.innerText || '').toLowerCase();
      return hasPwd && (text.includes('log in') || text.includes('sign in') || text.includes('login') || text.includes('登录'));
    });
  } catch { return false; }
}

async function waitForLogin(page: Page, siteName: string, timeoutMs = 120000): Promise<boolean> {
  console.log('[agent] ' + siteName + ' 需要登录，请在浏览器窗口中操作...');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(3000);
    const stillLogin = await detectLoginPage(page);
    if (!stillLogin) {
      console.log('[agent] ' + siteName + ' 登录成功！');
      return true;
    }
  }
  console.log('[agent] ' + siteName + ' 登录超时');
  return false;
}
// ===================== Thingiverse =====================

async function searchThingiverse(keyword: string): Promise<SearchResult[]> {
  const ctx = await getContext('thingiverse');
  const page = await ctx.newPage();
  try {
    const url = 'https://www.thingiverse.com/search?q=' + encodeURIComponent(keyword) + '&type=things&sort=relevant';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    if (await detectLoginPage(page)) {
      const ok = await waitForLogin(page, 'Thingiverse');
      if (!ok) return [];
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
    }

    await saveStorage('thingiverse', ctx);

    return page.evaluate(() => {
      const results: Array<{id:string;title:string;detailUrl:string;thumbnail:string;modelId:string}> = [];
      const seen = new Set<string>();

      document.querySelectorAll('a[href*="/thing:"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const m = href.match(/thing:(\d+)/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);

        const titleEl = a.querySelector('[class*="name"], [class*="title"], h3, h4, span');
        const title = (titleEl as HTMLElement)?.textContent?.trim()
          || a.getAttribute('title')
          || a.textContent?.trim().split('\n')[0]?.trim()
          || '';
        if (title.length < 2) return;

        const img = a.querySelector('img');
        results.push({
          id: 'thingiverse-' + m[1],
          modelId: m[1],
          title: title.substring(0, 120),
          detailUrl: 'https://www.thingiverse.com/thing:' + m[1],
          thumbnail: img?.getAttribute('src') || '',
        });
      });
      return results;
    });
  } finally {
    await page.close();
  }
}

async function resolveThingiverseFiles(thingId: string): Promise<FileResult[]> {
  const ctx = await getContext('thingiverse');
  const page = await ctx.newPage();
  try {
    const url = 'https://www.thingiverse.com/thing:' + thingId + '/files';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    if (await detectLoginPage(page)) {
      await waitForLogin(page, 'Thingiverse');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
    }

    await saveStorage('thingiverse', ctx);

    return page.evaluate(() => {
      const files: Array<{url:string;filename:string;format:string}> = [];
      const seen = new Set<string>();

      document.querySelectorAll('a[href*="/files/"], a[href*="download"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent?.trim() || '';
        if (/\.(stl|zip|obj|3mf|step)(\?|#|$)/i.test(text) || /\.(stl|zip|obj|3mf|step)(\?|#|$)/i.test(href)) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.thingiverse.com' + href;
          if (!seen.has(fullUrl)) {
            seen.add(fullUrl);
            const name = text.split('\n')[0].trim() || fullUrl.split('/').pop() || 'model.stl';
            const ext = name.split('.').pop()?.toLowerCase() || 'stl';
            files.push({ url: fullUrl, filename: name.substring(0, 80), format: ext });
          }
        }
      });

      if (files.length === 0) {
        const zipUrl = window.location.origin + '/thing:' + (document.querySelector('[data-thing-id]')?.getAttribute('data-thing-id') || window.location.pathname.match(/thing:(\d+)/)?.[1] || '') + '/zip';
        if (zipUrl.includes('thing:')) {
          files.push({ url: zipUrl, filename: 'model.zip', format: 'zip' });
        }
      }

      return files;
    });
  } finally {
    await page.close();
  }
}
// ===================== Printables =====================

async function searchPrintables(keyword: string): Promise<SearchResult[]> {
  const ctx = await getContext('printables');
  const page = await ctx.newPage();
  try {
    const url = 'https://www.printables.com/search/models?q=' + encodeURIComponent(keyword);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Cloudflare challenge
    await page.waitForTimeout(8000);

    // 等 Cloudflare challenge 通过
    for (let i = 0; i < 10; i++) {
      const title = await page.title();
      if (!title.includes('moment') && !title.includes('Just a') && !title.includes('Cloudflare')) break;
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(3000);

    if (await detectLoginPage(page)) {
      const ok = await waitForLogin(page, 'Printables');
      if (!ok) return [];
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
    }

    await saveStorage('printables', ctx);

    return page.evaluate(() => {
      const results: Array<{id:string;title:string;detailUrl:string;thumbnail:string;modelId:string}> = [];
      const seen = new Set<string>();

      // 方式1: __NEXT_DATA__
      try {
        const script = document.querySelector('script#__NEXT_DATA__');
        if (script) {
          const json = JSON.parse(script.textContent || '{}');
          const models = json?.props?.pageProps?.models || json?.props?.pageProps?.searchResults?.models || [];
          for (const m of models) {
            if (seen.has(String(m.id))) continue;
            seen.add(String(m.id));
            results.push({
              id: 'printables-' + m.id,
              modelId: String(m.id),
              title: m.name || m.title || '',
              detailUrl: 'https://www.printables.com/model/' + m.id,
              thumbnail: m.image?.urls?.[0]?.url || m.thumbnail?.url || '',
            });
          }
        }
      } catch { /* ignore */ }

      // 方式2: 链接解析
      document.querySelectorAll('a[href*="/model/"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/model\/(\d+)/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        const titleEl = a.querySelector('[class*="title"], h3, h4');
        const title = (titleEl as HTMLElement)?.textContent?.trim()
          || (a.querySelector('img') as HTMLImageElement)?.alt
          || a.textContent?.trim().split('\n')[0]?.trim()
          || '';
        if (title.length < 2) return;
        const img = a.querySelector('img');
        results.push({
          id: 'printables-' + m[1],
          modelId: m[1],
          title: title.substring(0, 120),
          detailUrl: 'https://www.printables.com/model/' + m[1],
          thumbnail: img?.getAttribute('src') || '',
        });
      });

      return results;
    });
  } finally {
    await page.close();
  }
}

async function resolvePrintablesFiles(modelId: string): Promise<FileResult[]> {
  const ctx = await getContext('printables');
  const page = await ctx.newPage();
  try {
    const url = 'https://www.printables.com/model/' + modelId;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
    for (let i = 0; i < 5; i++) {
      const title = await page.title();
      if (!title.includes('moment') && !title.includes('Just a')) break;
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(3000);
    await saveStorage('printables', ctx);

    return page.evaluate(() => {
      const files: Array<{url:string;filename:string;format:string}> = [];
      const seen = new Set<string>();

      // 从 __NEXT_DATA__ 获取文件列表
      try {
        const script = document.querySelector('script#__NEXT_DATA__');
        if (script) {
          const json = JSON.parse(script.textContent || '{}');
          const model = json?.props?.pageProps?.model || json?.props?.pageProps;
          const downloadUrl = model?.download?.url || model?.download_url || model?.stl_url;
          if (downloadUrl && !seen.has(downloadUrl)) {
            seen.add(downloadUrl);
            files.push({ url: downloadUrl, filename: (model.name || 'model') + '.stl', format: 'stl' });
          }
          // 文件列表
          const fileArray = model?.files || model?.model_files || [];
          for (const f of fileArray) {
            const fUrl = f.download_url || f.url || '';
            if (fUrl && !seen.has(fUrl)) {
              seen.add(fUrl);
              files.push({ url: fUrl, filename: f.name || f.filename || 'model.stl', format: f.name?.split('.').pop() || 'stl' });
            }
          }
        }
      } catch { /* ignore */ }

      // 链接方式
      document.querySelectorAll('a[href*="download"], a[href*=".stl"], a[href*=".zip"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (/\.(stl|zip|obj|3mf)(\?|#|$)/i.test(href) || href.includes('download')) {
          const fullUrl = href.startsWith('http') ? href : 'https://www.printables.com' + href;
          if (!seen.has(fullUrl)) {
            seen.add(fullUrl);
            const name = a.textContent?.trim()?.split('\n')[0] || fullUrl.split('/').pop() || 'model.stl';
            files.push({ url: fullUrl, filename: name.substring(0, 80), format: name.split('.').pop() || 'stl' });
          }
        }
      });

      // 兜底: CDN URL pattern
      if (files.length === 0) {
        const html = document.documentElement.innerHTML;
        const cdnUrls = html.match(/https?:\/\/[^"'\s]*?(?:files|cdn)[^"'\s]*?\.(?:stl|zip|3mf)/gi) || [];
        for (const u of cdnUrls) {
          if (!seen.has(u)) {
            seen.add(u);
            files.push({ url: u, filename: u.split('/').pop() || 'model.stl', format: u.split('.').pop() || 'stl' });
          }
        }
      }

      return files;
    });
  } finally {
    await page.close();
  }
}
// ===================== Yeggi =====================

async function searchYeggi(keyword: string): Promise<SearchResult[]> {
  const ctx = await getContext('yeggi');
  const page = await ctx.newPage();
  try {
    const url = 'https://www.yeggi.com/q/' + encodeURIComponent(keyword + ' stl') + '/';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await saveStorage('yeggi', ctx);

    return page.evaluate(() => {
      const results: Array<{id:string;title:string;detailUrl:string;thumbnail:string;modelId:string}> = [];
      const seen = new Set<string>();

      // Yeggi 结果在 .search-result 或类似容器中
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        // thingiverse thing links
        const thingMatch = href.match(/thing:(\d+)/);
        // printables model links
        const printMatch = href.match(/\/model\/(\d+)/);
        // yeggi 自己的模型页
        const yeggiMatch = href.match(/\/model\/(\d+)\//);

        let modelId = '';
        let site = '';
        if (thingMatch) { modelId = thingMatch[1]; site = 'thingiverse'; }
        else if (printMatch) { modelId = printMatch[1]; site = 'printables'; }
        else if (yeggiMatch) { modelId = yeggiMatch[1]; site = 'yeggi'; }
        else return;

        const dedupeKey = site + ':' + modelId;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        const titleEl = a.querySelector('h3, h4, [class*="title"], [class*="name"]');
        const title = (titleEl as HTMLElement)?.textContent?.trim()
          || a.getAttribute('title')
          || a.textContent?.trim().split('\n')[0]?.trim()
          || '';
        if (title.length < 2) return;

        const img = a.querySelector('img');
        const targetUrl = site === 'thingiverse'
          ? 'https://www.thingiverse.com/thing:' + modelId
          : site === 'printables'
          ? 'https://www.printables.com/model/' + modelId
          : href;

        results.push({
          id: 'yeggi-' + dedupeKey.replace(':', '-'),
          modelId,
          title: title.substring(0, 120),
          detailUrl: targetUrl,
          thumbnail: img?.getAttribute('src') || '',
        });
      });

      return results.slice(0, 20);
    });
  } finally {
    await page.close();
  }
}
// ===================== Express =====================

const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-agent-token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ---- No auth ----
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', paired: !!pairedToken, browserConnected: browser?.isConnected() || false });
});

app.get('/pairing-code', (_req, res) => {
  if (pairedToken) return res.json({ paired: true });
  res.json({ code: pairingToken.slice(0, 8) });
});

app.post('/pair', (req, res) => {
  const { code } = req.body;
  if (!code || code !== pairingToken) return res.status(403).json({ error: '配对码不正确' });
  pairedToken = crypto.randomBytes(32).toString('hex');
  pairingToken = crypto.randomBytes(32).toString('hex');
  console.log('[agent] 新配对成功，新配对码: ' + pairingToken.slice(0, 8));
  res.json({ token: pairedToken, message: '配对成功！' });
});

// ---- Auth middleware ----
app.use((req, res, next) => {
  if (['/health', '/pair', '/pairing-code'].includes(req.path)) return next();
  const token = req.headers['x-agent-token'];
  if (!pairedToken || token !== pairedToken) return res.status(401).json({ error: '未配对或 Token 无效' });
  next();
});

// ---- Agent search (called by frontend search-stl route) ----
app.post('/agent-search', async (req, res) => {
  const { keyword, sites } = req.body as { keyword: string; sites?: string[] };
  if (!keyword) return res.status(400).json({ error: '缺少 keyword' });

  const targetSites = sites || ['thingiverse', 'printables', 'yeggi'];
  const allResults: SearchResult[] = [];

  const siteHandlers: Record<string, () => Promise<SearchResult[]>> = {
    thingiverse: () => searchThingiverse(keyword),
    printables: () => searchPrintables(keyword),
    yeggi: () => searchYeggi(keyword),
  };

  const tasks = targetSites
    .filter(s => siteHandlers[s])
    .map(async site => {
      try {
        const results = await siteHandlers[site]();
        console.log('[agent] ' + site + ': ' + results.length + ' results');
        return results.map(r => ({ ...r, site }));
      } catch (e) {
        console.error('[agent] ' + site + ' search failed:', e instanceof Error ? e.message : e);
        return [] as SearchResult[];
      }
    });

  const batchResults = await Promise.all(tasks);
  for (const r of batchResults) allResults.push(...r);

  res.json({
    success: true,
    results: allResults,
    total: allResults.length,
    sites: targetSites,
  });
});

// ---- Agent resolve files (called by frontend) ----
app.post('/agent-resolve', async (req, res) => {
  const { site, modelId, url } = req.body as { site: string; modelId?: string; url?: string };
  if (!site) return res.status(400).json({ error: '缺少 site' });

  // 从 URL 提取 modelId
  let id = modelId;
  if (!id && url) {
    const thingMatch = url.match(/thing:(\d+)/);
    const printMatch = url.match(/\/model\/(\d+)/);
    if (thingMatch) id = thingMatch[1];
    else if (printMatch) id = printMatch[1];
  }
  if (!id) return res.status(400).json({ error: '无法提取 modelId' });

  try {
    let files: FileResult[] = [];
    if (site === 'thingiverse') files = await resolveThingiverseFiles(id);
    else if (site === 'printables') files = await resolvePrintablesFiles(id);
    else return res.status(400).json({ error: '不支持的站点: ' + site });

    res.json({ success: true, files, total: files.length });
  } catch (e) {
    console.error('[agent] resolve failed:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'resolve failed' });
  }
});

// ---- Health check for specific site ----
app.get('/agent-check/:site', async (req, res) => {
  const site = req.params.site;
  try {
    const ctx = await getContext(site);
    const cookies = await ctx.cookies();
    res.json({ site, hasCookies: cookies.length > 0, browserConnected: browser?.isConnected() || false });
  } catch {
    res.json({ site, hasCookies: false, browserConnected: false });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('[Browser Agent] Running on http://127.0.0.1:' + PORT);
  console.log('[Browser Agent] Pairing code: ' + pairingToken.slice(0, 8));
  console.log('[Browser Agent] 支持站点: Thingiverse, Printables, Yeggi');
});