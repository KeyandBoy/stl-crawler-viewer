import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;

console.log('[list-stl] BLOB_READ_WRITE_TOKEN exists:', !!BLOB_TOKEN);
console.log('[list-stl] USE_BLOB:', USE_BLOB);

export async function GET() {
  try {
    if (USE_BLOB) {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({ 
        prefix: 'stl-models/',
        token: BLOB_TOKEN,
      });
      
      const stlFiles = blobs
        .filter(b => b.pathname.toLowerCase().endsWith('.stl'))
        .map(b => ({
          key: b.pathname.replace('stl-models/', ''),
          url: b.url, // Private URL，需要签名才能访问
          filename: b.pathname.replace('stl-models/', ''),
        }));
      
      console.log('[list-stl] Found', stlFiles.length, 'files in Vercel Blob');
      return NextResponse.json({ success: true, files: stlFiles, total: stlFiles.length });
    }

    // 本地
    const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    const files = fs.readdirSync(STORAGE_DIR)
      .filter(f => f.toLowerCase().endsWith('.stl'))
      .map(f => ({ key: f, url: `/stl-models/${f}`, filename: f }));
    console.log('[list-stl] Found', files.length, 'local files');
    return NextResponse.json({ success: true, files, total: files.length });

  } catch (error) {
    console.error('[list-stl] Error:', error);
    return NextResponse.json({ success: true, files: [], total: 0 });
  }
}
