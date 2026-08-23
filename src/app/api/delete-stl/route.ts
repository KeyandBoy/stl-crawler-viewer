import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isAdminKey, removeLibraryItem } from '@/lib/libraryMetadata';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;

/** 从图书馆删除模型（Blob 或本地文件，含空目录清理） */
export async function POST(request: NextRequest) {
  try {
    const { url, key } = await request.json();

    if (!isAdminKey(request.headers.get('x-admin-key'))) {
      return NextResponse.json({ error: 'Admin key required' }, { status: 403 });
    }

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (key) await removeLibraryItem(key);

    if (USE_BLOB && url.includes('blob.vercel-storage.com')) {
      const { del } = await import('@vercel/blob');
      await del(url, { token: BLOB_TOKEN });
      console.log('[delete-stl] Deleted from Vercel Blob:', url);
      return NextResponse.json({ success: true });
    }

    // 本地删除：支持子目录
    // URL 格式: /stl-models/subfolder/filename.stl
    const relativePath = url.replace('/stl-models/', '').replace(/^(\.\.[\/\\])+/, '');
    const stlModelsDir = path.join(process.cwd(), 'public', 'stl-models');
    const filePath = path.resolve(stlModelsDir, relativePath);

    if (!filePath.startsWith(path.resolve(stlModelsDir))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[delete-stl] Deleted local file:', filePath);

      // 检查父目录是否为空，如果是空目录则删除
      const parentDir = path.dirname(filePath);
      if (parentDir !== stlModelsDir) {
        const remainingFiles = fs.readdirSync(parentDir);
        if (remainingFiles.length === 0) {
          fs.rmdirSync(parentDir);
          console.log('[delete-stl] Removed empty directory:', parentDir);
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[delete-stl] Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete STL file' }, { status: 500 });
  }
}
