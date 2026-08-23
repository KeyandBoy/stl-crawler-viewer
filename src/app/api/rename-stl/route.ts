import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { canEditSuffix, getLibraryItem, isAdminKey, sanitizeFilename, updateLibraryItem } from '@/lib/libraryMetadata';
import { generateCategoryFilename } from '@/lib/libraryRules';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;
const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');

export async function POST(request: NextRequest) {
  try {
    const { oldKey, oldUrl, newFilename, category, displayName } = await request.json();
    const ownerToken = request.headers.get('x-owner-token');
    const admin = isAdminKey(request.headers.get('x-admin-key'));

    if (!oldKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const meta = await getLibraryItem(oldKey);

    // 新模式：传入 category + displayName，自动生成规范化文件名
    if (category && displayName) {
      const cleanFilename = generateCategoryFilename(category, displayName, 1);

      if (meta) {
        if (!admin && !canEditSuffix(meta, ownerToken)) {
          return NextResponse.json({ error: 'No permission to rename this model' }, { status: 403 });
        }
        const updated = await updateLibraryItem(oldKey, {
          prefix: '',
          suffix: cleanFilename,
          category,
          categorySource: 'user',
          displayName,
        });

        // 本地模式：移动文件到分类目录
        if (meta.storage === 'local' && meta.url.startsWith('/stl-models/')) {
          const oldPath = path.join(STORAGE_DIR, oldKey);
          const newDir = path.join(STORAGE_DIR, category);
          if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
          const newPath = path.join(newDir, cleanFilename);
          if (fs.existsSync(oldPath) && oldPath !== newPath) {
            fs.copyFileSync(oldPath, newPath);
            fs.unlinkSync(oldPath);
            const oldDir = path.dirname(oldPath);
            if (oldDir !== STORAGE_DIR && fs.existsSync(oldDir)) {
              try { if (fs.readdirSync(oldDir).length === 0) fs.rmdirSync(oldDir); } catch {}
            }
          }
        }

        return NextResponse.json({
          success: true, oldKey, newKey: oldKey,
          newUrl: updated?.url || oldUrl,
          filename: cleanFilename,
        });
      }
    }

    // 旧模式：直接传 newFilename
    if (!newFilename) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!newFilename.toLowerCase().endsWith('.stl')) {
      return NextResponse.json({ error: 'Filename must end with .stl' }, { status: 400 });
    }

    const cleanFilename = sanitizeFilename(String(newFilename).replace(/[\\/]+/g, '_'));

    if (meta) {
      if (!admin && !canEditSuffix(meta, ownerToken)) {
        return NextResponse.json({ error: 'No permission to rename this model' }, { status: 403 });
      }

      let prefix = meta.prefix;
      let suffix = cleanFilename;
      if (admin) {
        const withoutExt = cleanFilename.replace(/\.stl$/i, '');
        const sep = withoutExt.indexOf('_');
        if (sep > 0) {
          prefix = withoutExt.slice(0, sep).trim();
          suffix = `${withoutExt.slice(sep + 1).trim() || meta.suffix.replace(/\.stl$/i, '')}.stl`;
        }
      }

      const updated = await updateLibraryItem(oldKey, { prefix, suffix: sanitizeFilename(suffix) });
      return NextResponse.json({
        success: true, oldKey, newKey: oldKey,
        newUrl: updated?.url || oldUrl,
        filename: updated ? `${updated.prefix ? `${updated.prefix}_` : ''}${updated.suffix}` : cleanFilename,
      });
    }

    if (!admin) return NextResponse.json({ error: 'Admin key required for legacy file rename' }, { status: 403 });

    if (USE_BLOB) {
      const { del, put } = await import('@vercel/blob');
      const downloadUrl = oldUrl.includes('blob.vercel-storage.com') ? oldUrl : `https://blob.vercel-storage.com/${oldKey}`;
      const response = await fetch(downloadUrl, { headers: { 'Authorization': `Bearer ${BLOB_TOKEN}` } });
      if (!response.ok) throw new Error(`Failed to download blob: ${response.status}`);
      const blob = await response.blob();
      const newBlob = await put(`stl-models/${cleanFilename}`, blob, { access: 'private', token: BLOB_TOKEN, addRandomSuffix: true });
      try { await del(oldUrl, { token: BLOB_TOKEN }); } catch {}
      return NextResponse.json({ success: true, oldKey, newKey: cleanFilename, newUrl: newBlob.url });
    } else {
      const oldPath = path.join(STORAGE_DIR, oldKey);
      const newPath = path.join(STORAGE_DIR, cleanFilename);
      if (!fs.existsSync(oldPath)) {
        return NextResponse.json({ error: 'File not found: ' + oldPath }, { status: 404 });
      }
      fs.renameSync(oldPath, newPath);
      const oldDir = path.dirname(oldPath);
      if (oldDir !== STORAGE_DIR && fs.existsSync(oldDir)) {
        try { if (fs.readdirSync(oldDir).length === 0) fs.rmdirSync(oldDir); } catch {}
      }
      return NextResponse.json({ success: true, oldKey, newKey: cleanFilename, newUrl: `/stl-models/${cleanFilename}` });
    }
  } catch (error) {
    console.error('[rename-stl] Error:', error);
    return NextResponse.json({ error: 'Failed to rename file', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
