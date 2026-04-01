import { NextRequest, NextResponse } from 'next/server';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!BLOB_TOKEN) {
      // 本地模式，直接返回原 URL
      return NextResponse.json({ signedUrl: url });
    }

    // Private Blob：用 axios 直接获取文件内容，然后返回给前端
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${BLOB_TOKEN}`,
      },
    });

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
