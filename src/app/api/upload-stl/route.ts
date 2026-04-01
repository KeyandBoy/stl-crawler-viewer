import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

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
      const blob = await put(`stl-models/${file.name}`, file, {
        access: 'public',
        addRandomSuffix: false,
      });
      return NextResponse.json({ success: true, key: file.name, url: blob.url, filename: file.name });
    }

    // 本地开发：写入 public/stl-models 目录
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
    console.error('Upload STL error:', error);
    return NextResponse.json({ error: 'Failed to upload STL file' }, { status: 500 });
  }
}
