import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    await del(url);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete STL error:', error);
    return NextResponse.json({ error: 'Failed to delete STL file' }, { status: 500 });
  }
}
