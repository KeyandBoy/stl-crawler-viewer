import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (USE_BLOB) {
      const { del } = await import('@vercel/blob');
      await del(url);
      return NextResponse.json({ success: true });
    }

    // 本地删除：url 格式为 /stl-models/filename.stl
    const filename = url.replace('/stl-models/', '');
    const filePath = path.join(process.cwd(), 'public', 'stl-models', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete STL error:', error);
    return NextResponse.json({ error: 'Failed to delete STL file' }, { status: 500 });
  }
}
