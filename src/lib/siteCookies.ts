import fs from 'fs';
import path from 'path';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;
const CONFIG_BLOB_PREFIX = 'config/site-cookies.json';
const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'data', 'site-cookies.json');

export interface SiteCookies {
  [siteId: string]: string;
}

/**
 * 加载所有站点的 Cookie。
 * 生产（Vercel Blob）：读取 config/site-cookies.json（私有 blob）。
 * 本地开发：读取 data/site-cookies.json。
 * 优先级：环境变量 COOKIE_<SITE_ID_UPPER> > 存储文件。
 */
export async function loadSiteCookies(): Promise<SiteCookies> {
  const fileCookies = await loadFromStorage();
  const merged: SiteCookies = { ...fileCookies };
  for (const site of ['thingiverse', 'printables', 'aigei', '3d66', 'sketchfab', 'yeggi']) {
    const envVal = process.env[`COOKIE_${site.toUpperCase()}`];
    if (envVal) merged[site] = envVal;
  }
  return merged;
}

export async function getSiteCookie(siteId: string): Promise<string> {
  const all = await loadSiteCookies();
  return all[siteId] || '';
}

export async function saveSiteCookies(cookies: SiteCookies): Promise<void> {
  if (USE_BLOB) {
    const { put } = await import('@vercel/blob');
    await put(CONFIG_BLOB_PREFIX, JSON.stringify(cookies, null, 2), {
      access: 'private',
      token: BLOB_TOKEN,
      addRandomSuffix: false,
    });
    return;
  }
  fs.mkdirSync(path.dirname(LOCAL_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(cookies, null, 2), 'utf-8');
}

async function loadFromStorage(): Promise<SiteCookies> {
  if (USE_BLOB) {
    try {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({ prefix: CONFIG_BLOB_PREFIX, token: BLOB_TOKEN });
      const target = blobs.find((b) => b.pathname === CONFIG_BLOB_PREFIX);
      if (!target) return {};
      const res = await fetch(target.url, {
        headers: { Authorization: `Bearer ${BLOB_TOKEN}` },
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data && typeof data === 'object' ? (data as SiteCookies) : {};
    } catch (e) {
      console.error('[siteCookies] Blob 读取失败:', e);
      return {};
    }
  }
  try {
    if (!fs.existsSync(LOCAL_CONFIG_PATH)) return {};
    const data = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf-8'));
    return data && typeof data === 'object' ? (data as SiteCookies) : {};
  } catch (e) {
    console.error('[siteCookies] 本地读取失败:', e);
    return {};
  }
}
