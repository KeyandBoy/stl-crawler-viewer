import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 本地存储目录
const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');

// 自动创建文件夹
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export async function GET(request: NextRequest) {
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    
    const stlFiles = files
      .filter(file => file.toLowerCase().endsWith('.stl'))
      .map(file => ({
        key: file,
        url: `/stl-models/${file}`,
        filename: file,
      }));

    return NextResponse.json({
      success: true,
      files: stlFiles,
      total: stlFiles.length,
    });
  } catch (error) {
    console.error('List STL error:', error);
    return NextResponse.json({ success: true, files: [], total: 0 });
  }
}