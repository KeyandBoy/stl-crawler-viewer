import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ownerHash, sanitizeFilename, upsertLibraryItem } from '@/lib/libraryMetadata';
import { classifyByRules, generateCategoryFilename, generateDisplayName, UNCLASSIFIED } from '@/lib/libraryRules';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_STL_UPLOAD_BYTES || 50 * 1024 * 1024);

// 调试日志
console.log('[upload-stl] BLOB_READ_WRITE_TOKEN exists:', !!BLOB_TOKEN);
console.log('[upload-stl] USE_BLOB:', USE_BLOB);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ownerToken = request.headers.get('x-owner-token');
    const hash = ownerHash(ownerToken);

    if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.stl')) {
      return NextResponse.json({ error: 'Only STL files are allowed' }, { status: 400 });
    }
    if (!hash) return NextResponse.json({ error: 'Missing anonymous owner token' }, { status: 401 });
    if (file.size <= 84 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `STL file size must be 85 bytes to ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.slice(0, 256).toString('utf8').toLowerCase().includes('<html')) {
      return NextResponse.json({ error: 'Invalid STL file: looks like HTML' }, { status: 400 });
    }

    // 分类：优先用户选择，否则自动规则匹配
    const userCategory = (formData.get('category') as string) || '';
    const autoCategory = classifyByRules(file.name.replace(/\.stl$/i, ''));
    const category = userCategory || autoCategory;
    const categorySource: 'user' | 'rule' = userCategory ? 'user' : 'rule';
    const displayName = generateDisplayName(file.name);

    const safeOriginal = sanitizeFilename(file.name);
    const categoryFilename = generateCategoryFilename(category, displayName, 1);
    const storageKey = `${crypto.randomUUID()}_${categoryFilename}`;
    const now = new Date().toISOString();
    const status = process.env.MODERATE_UPLOADS === 'true' ? 'pending' : 'approved';

    if (USE_BLOB) {
      const { put } = await import('@vercel/blob');
      const blob = await put(`stl-models/${storageKey}`, buffer, {
        access: 'private',
        token: BLOB_TOKEN,
        contentType: 'model/stl',
      });
      await upsertLibraryItem({
        key: storageKey,
        url: blob.url,
        storage: 'blob',
        originalFilename: safeOriginal,
        suffix: categoryFilename,
        prefix: '',
        category,
        categorySource,
        displayName,
        status,
        ownerHash: hash,
        size: file.size,
        createdAt: now,
        updatedAt: now,
      });
      console.log('[upload-stl] Uploaded to Vercel Blob (private):', blob.url);
      return NextResponse.json({
        success: true,
        key: storageKey,
        url: blob.url,
        filename: safeOriginal,
        status,
      });
    }

    // 本地开发
    const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(path.join(STORAGE_DIR, storageKey), buffer);
    await upsertLibraryItem({
      key: storageKey,
      url: `/stl-models/${storageKey}`,
      storage: 'local',
      originalFilename: safeOriginal,
      suffix: categoryFilename,
      prefix: '',
      category,
      categorySource,
      displayName,
      status,
      ownerHash: hash,
      size: file.size,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({
      success: true,
      key: storageKey,
      url: `/stl-models/${storageKey}`,
      filename: safeOriginal,
      status,
    });

  } catch (error) {
    console.error('[upload-stl] Error:', error);
    return NextResponse.json({ error: 'Failed to upload STL file' }, { status: 500 });
  }
}
