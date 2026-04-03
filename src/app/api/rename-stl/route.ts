import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const { oldKey, oldUrl, newFilename } = await request.json();

    if (!oldKey || !newFilename) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!newFilename.toLowerCase().endsWith('.stl')) {
      return NextResponse.json({ error: 'Filename must end with .stl' }, { status: 400 });
    }

    // 确保只使用文件名，不使用子文件夹路径
    // 如果 newFilename 包含路径，只取文件名部分
    let cleanFilename = newFilename;
    if (newFilename.includes('/')) {
      // 如果是 "category_name/file.stl" 格式，改为 "category_name_file.stl"
      const parts = newFilename.split('/');
      cleanFilename = parts.join('_');
    } else if (newFilename.includes('\\')) {
      // 如果是 "category_name\file.stl" 格式，改为 "category_name_file.stl"
      const parts = newFilename.split('\\');
      cleanFilename = parts.join('_');
    }

    if (USE_BLOB) {
      // Vercel Blob 模式
      const { del, put } = await import('@vercel/blob');
      
      const downloadUrl = oldUrl.includes('blob.vercel-storage.com') 
        ? oldUrl 
        : `https://blob.vercel-storage.com/${oldKey}`;
      
      console.log('[rename-stl] Downloading from:', downloadUrl);
      const response = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${BLOB_TOKEN}` },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download blob: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // 上传新文件
      const newBlob = await put(`stl-models/${cleanFilename}`, blob, {
        access: 'private',
        token: BLOB_TOKEN,
        addRandomSuffix: true,
      });
      
      console.log('[rename-stl] Uploaded new blob:', newBlob.url);
      
      try {
        await del(oldUrl, { token: BLOB_TOKEN });
      } catch (delError) {
        console.warn('[rename-stl] Failed to delete old blob:', delError);
      }
      
      return NextResponse.json({
        success: true,
        oldKey,
        newKey: cleanFilename,
        newUrl: newBlob.url,
      });
    } else {
      // 本地文件系统模式
      const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');
      
      // 处理 oldKey（可能是子目录中的文件）
      const oldPath = path.join(STORAGE_DIR, oldKey);
      const newPath = path.join(STORAGE_DIR, cleanFilename);
      
      if (!fs.existsSync(oldPath)) {
        return NextResponse.json({ error: 'File not found: ' + oldPath }, { status: 404 });
      }
      
      // 重命名文件
      fs.renameSync(oldPath, newPath);
      console.log('[rename-stl] Renamed:', oldKey, '→', cleanFilename);
      
      // 检查旧的父目录是否为空，如果是则删除
      const oldDir = path.dirname(oldPath);
      if (oldDir !== STORAGE_DIR && fs.existsSync(oldDir)) {
        try {
          const remainingFiles = fs.readdirSync(oldDir);
          if (remainingFiles.length === 0) {
            fs.rmdirSync(oldDir);
            console.log('[rename-stl] Removed empty directory:', oldDir);
          }
        } catch (e) {
          // 忽略目录清理错误
        }
      }
      
      return NextResponse.json({
        success: true,
        oldKey,
        newKey: cleanFilename,
        newUrl: `/stl-models/${cleanFilename}`,
      });
    }
  } catch (error) {
    console.error('[rename-stl] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to rename file',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
