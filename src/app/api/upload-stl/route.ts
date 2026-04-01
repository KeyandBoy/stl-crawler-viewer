import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;

// 调试日志
console.log('[upload-stl] BLOB_READ_WRITE_TOKEN exists:', !!BLOB_TOKEN);
console.log('[upload-stl] USE_BLOB:', USE_BLOB);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.stl')) {
      return NextResponse.json({ error: 'Only STL files are allowed' }, { status: 400 });
    }

    if (USE_BLOB) {
      const { put } = await import('@vercel/blob');
      // Private 模式：不指定 access 或 access: 'private'
      const blob = await put(`stl-models/${file.name}`, file, {
        access: 'private',
        token: BLOB_TOKEN,
        addRandomSuffix: true,
      });
      console.log('[upload-stl] Uploaded to Vercel Blob (private):', blob.url);
      return NextResponse.json({
        success: true,
        key: file.name,
        url: blob.url,
        filename: file.name,
      });
    }

    // 本地开发
    const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(STORAGE_DIR, file.name), buffer);
    return NextResponse.json({
      success: true,
      key: file.name,
      url: `/stl-models/${file.name}`,
      filename: file.name,
    });

  } catch (error) {
    console.error('[upload-stl] Error:', error);
    return NextResponse.json({ error: 'Failed to upload STL file' }, { status: 500 });
  }
}
