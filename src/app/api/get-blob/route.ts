import { NextRequest, NextResponse } from 'next/server';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let response: Response;

    // Public Blob (public.blob.vercel-storage.com)：直接下载
    if (url.includes('public.blob.vercel-storage.com')) {
      response = await fetch(url);
    } 
    // Private Blob：需要带授权
    else if (url.includes('blob.vercel-storage.com') && BLOB_TOKEN) {
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${BLOB_TOKEN}`,
        },
      });
    } 
    // 本地文件
    else {
      response = await fetch(url);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.status}`);
    }

    const blob = await response.blob();
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[get-blob] Error:', error);
    return NextResponse.json({ error: 'Failed to get blob' }, { status: 500 });
  }
}
