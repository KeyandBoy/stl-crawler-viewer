import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'public', 'stl-models');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

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

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filePath = path.join(STORAGE_DIR, file.name);
    
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({
      success: true,
      key: file.name,
      url: `/stl-models/${file.name}`,
      filename: file.name,
    });
  } catch (error) {
    console.error('Upload STL error:', error);
    return NextResponse.json({ error: 'Failed to upload STL file' }, { status: 500 });
  }
}