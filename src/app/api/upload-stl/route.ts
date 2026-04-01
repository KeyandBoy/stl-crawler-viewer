import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.stl')) {
      return NextResponse.json({ error: 'Only STL files are allowed' }, { status: 400 });
    }

    const blob = await put(`stl-models/${file.name}`, file, {
      access: 'public',
      addRandomSuffix: false,
    });

    return NextResponse.json({
      success: true,
      key: file.name,
      url: blob.url,
      filename: file.name,
    });
  } catch (error) {
    console.error('Upload STL error:', error);
    return NextResponse.json({ error: 'Failed to upload STL file' }, { status: 500 });
  }
}
