import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import axios from 'axios';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { getSiteCookie } from '@/lib/siteCookies';
import { detectSiteId, KEY_THINGIVERSE_API_TOKEN } from '@/lib/siteConfig';
import { ownerHash, sanitizeFilename, upsertLibraryItem } from '@/lib/libraryMetadata';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;

/**
 * POST { url, filename, title }
 * 从真实文件直链下载，若是 zip 则解压提取 STL，保存到模型库（Vercel Blob / 本地）。
 */
export async function POST(request: NextRequest) {
  try {
    const { url, filename, title } = await request.json();
    if (!url) return NextResponse.json({ error: '缺少下载 URL' }, { status: 400 });

    const ownerToken = request.headers.get('x-owner-token');
    const hash = ownerHash(ownerToken);

    const siteId = detectSiteId(url);
    const cookie = siteId ? await getSiteCookie(siteId) : '';
    const apiToken = /api\.thingiverse\.com/i.test(url) ? await getSiteCookie(KEY_THINGIVERSE_API_TOKEN) : '';
    const finalName = filename || title?.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_') || 'model.stl';

    const resp = await axios.get(url, {
      timeout: 60000,
      responseType: 'arraybuffer',
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        'Accept': '*/*',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {}),
        'Referer': (() => { try { return new URL(url).origin + '/'; } catch { return ''; } })(),
      },
    });

    const buffer = Buffer.from(resp.data);
    const isZip = /\.zip$/i.test(finalName) || (resp.headers['content-type'] as string || '').includes('zip');

    const filesToSave: Array<{ data: Buffer; name: string }> = [];
    if (isZip) {
      const zip = await JSZip.loadAsync(buffer);
      const stlEntries = Object.values(zip.files).filter(
        (f) => !f.dir && /\.stl$/i.test(f.name),
      );
      if (stlEntries.length === 0) {
        return NextResponse.json({ error: '压缩包内未找到 STL 文件' }, { status: 400 });
      }
      const picked = stlEntries.slice(0, 3);
      for (const entry of picked) {
        const data = Buffer.from(await entry.async('arraybuffer'));
        const name = entry.name.split('/').pop() || 'model.stl';
        filesToSave.push({ data, name });
      }
    } else {
      filesToSave.push({ data: buffer, name: finalName.replace(/\.(zip)$/i, '.stl') });
    }

    const saved: Array<{ key: string; url: string; filename: string }> = [];
    const now = new Date().toISOString();
    const status = process.env.MODERATE_UPLOADS === 'true' ? 'pending' : 'approved';

    for (const f of filesToSave) {
      const safeOriginal = sanitizeFilename(f.name);
      const storageKey = `${crypto.randomUUID()}_${safeOriginal}`;
      if (USE_BLOB) {
        const { put } = await import('@vercel/blob');
        const blob = await put(`stl-models/${storageKey}`, new Blob([new Uint8Array(f.data)]), {
          access: 'private',
          token: BLOB_TOKEN,
          contentType: 'model/stl',
        });
        await upsertLibraryItem({
          key: storageKey,
          url: blob.url,
          storage: 'blob',
          originalFilename: safeOriginal,
          suffix: safeOriginal,
          prefix: '',
          status,
          ownerHash: hash || '',
          size: f.data.length,
          createdAt: now,
          updatedAt: now,
        });
        saved.push({ key: storageKey, url: blob.url, filename: safeOriginal });
      } else {
        const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        fs.writeFileSync(path.join(STORAGE_DIR, storageKey), f.data);
        await upsertLibraryItem({
          key: storageKey,
          url: `/stl-models/${storageKey}`,
          storage: 'local',
          originalFilename: safeOriginal,
          suffix: safeOriginal,
          prefix: '',
          status,
          ownerHash: hash || '',
          size: f.data.length,
          createdAt: now,
          updatedAt: now,
        });
        saved.push({ key: storageKey, url: `/stl-models/${storageKey}`, filename: safeOriginal });
      }
    }

    return NextResponse.json({ success: true, saved });
  } catch (e) {
    console.error('[save-to-library] 错误:', e);
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: '目标站点要求登录：请配置对应站点 Cookie' }, { status: 502 });
    }
    return NextResponse.json({ error: '保存到模型库失败' }, { status: 500 });
  }
}
