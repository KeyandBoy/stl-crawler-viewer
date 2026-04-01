import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export async function GET() {
  try {
    const { blobs } = await list({ prefix: 'stl-models/' });

    const stlFiles = blobs
      .filter(b => b.pathname.toLowerCase().endsWith('.stl'))
      .map(b => ({
        key: b.pathname.replace('stl-models/', ''),
        url: b.url,
        filename: b.pathname.replace('stl-models/', ''),
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
