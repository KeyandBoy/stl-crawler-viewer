import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;

console.log('[list-stl] BLOB_READ_WRITE_TOKEN exists:', !!BLOB_TOKEN);
console.log('[list-stl] USE_BLOB:', USE_BLOB);

// 递归获取目录中所有 STL 文件
function getAllSTLFiles(dir: string, baseDir: string): Array<{ key: string; url: string; filename: string }> {
  const results: Array<{ key: string; url: string; filename: string }> = [];
  
  if (!fs.existsSync(dir)) {
    return results;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // 递归处理子目录
      const subResults = getAllSTLFiles(fullPath, baseDir);
      results.push(...subResults);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.stl')) {
      // 计算相对于基准目录的路径
      const relativePath = path.relative(baseDir, fullPath);
      // 使用正斜杠作为 URL 分隔符
      const key = relativePath.replace(/\\/g, '/');
      const url = `/stl-models/${key.replace(/\\/g, '/')}`;
      results.push({
        key,
        url,
        filename: entry.name,
      });
    }
  }
  
  return results;
}

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
          url: b.url,
          filename: b.pathname.split('/').pop() || '',
        }));
      
      console.log('[list-stl] Found', stlFiles.length, 'files in Vercel Blob');
      return NextResponse.json({ success: true, files: stlFiles, total: stlFiles.length });
    }

    // 本地：递归读取所有子文件夹
    const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    
    const files = getAllSTLFiles(STORAGE_DIR, STORAGE_DIR);
    console.log('[list-stl] Found', files.length, 'local files (including subfolders)');
    
    return NextResponse.json({ success: true, files, total: files.length });

  } catch (error) {
    console.error('[list-stl] Error:', error);
    return NextResponse.json({ success: true, files: [], total: 0 });
  }
}