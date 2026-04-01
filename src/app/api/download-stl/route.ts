import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (USE_BLOB && url.includes('blob.vercel-storage.com')) {
      const { del } = await import('@vercel/blob');
      await del(url, { token: BLOB_TOKEN });
      console.log('[download-stl] Deleted from Vercel Blob:', url);
      return NextResponse.json({ success: true });
    }

    // 本地删除
    const filename = url.replace('/stl-models/', '');
    const filePath = path.join(process.cwd(), 'public', 'stl-models', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[download-stl] Deleted local file:', filePath);
    }
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[download-stl] Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete STL file' }, { status: 500 });
  }
}
