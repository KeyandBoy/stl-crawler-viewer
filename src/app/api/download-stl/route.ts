import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url, filename } = await request.json();
    
    // 简化版：提示手动下载后上传
    return NextResponse.json({
      success: false,
      error: '请手动下载文件后使用【上传模型】功能',
      message: '直接下载已替换为本地存储模式'
    });
  } catch (error) {
    console.error('Download STL error:', error);
    return NextResponse.json({ error: 'Failed to download STL file' }, { status: 500 });
  }
}