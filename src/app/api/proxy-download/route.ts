import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { Readable } from 'stream';

// ===================== 已知可直接下载的文件域名 =====================
const DIRECT_DL_PATTERNS = [
  { pattern: /down\.aigei\.com/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'ancient-architecture.stl') }) },
  { pattern: /down\.3d66\.com/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'arch-model.stl') }) },
  { pattern: /down\.cgmodel\.com/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'cg-model.stl') }) },
  { pattern: /thingiverse\.com\/download:/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'thingiverse-model.stl') }) },
  { pattern: /printables\.com\/model\/\d+/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'printables-model.stl') }) },
  { pattern: /sketchfab\.com/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'sketchfab-model.stl') }) },
];

// 从 URL 提取文件名
function extractFilename(url: string, fallback: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /\.(stl|obj|3ds|fbx|dae)$/i.test(last)) return last;
  } catch { /* ignore */ }
  return fallback;
}

// ===================== Node.js Readable → Web ReadableStream =====================
function nodeStreamToWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

// ===================== 通用下载流 =====================
async function streamDownload(
  targetUrl: string,
  filename: string
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string }> {
  const response = await axios.get(targetUrl, {
    timeout: 30000,
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
      'Referer': new URL(targetUrl).origin + '/',
      'Accept': '*/*',
    },
    maxRedirects: 5,
  });

  // 尝试从响应头取真实文件名
  const cd = response.headers['content-disposition'] as string | undefined;
  if (cd && cd.includes('filename')) {
    const match = cd.match(/filename[^;=\n]*=(?:(['"])(.*?)\1|([^;\n]*))/i);
    if (match?.[2] || match?.[3]) {
      filename = (match[2] || match[3]).trim();
    }
  }

  return { stream: nodeStreamToWebStream(response.data as Readable), filename };
}

// ===================== SSRF 校验 =====================
function validateUrl(rawUrl: string): { url: string; error?: string } {
  if (!rawUrl) return { url: '', error: '缺少下载链接参数' };
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { url: '', error: '只支持 http/https 协议' };
    }
    return { url: rawUrl };
  } catch {
    return { url: '', error: '无效的 URL 格式' };
  }
}

// ===================== 主路由 =====================
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url') || '';

  const { url, error } = validateUrl(rawUrl);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    // 匹配已知下载模式
    for (const { pattern, fn } of DIRECT_DL_PATTERNS) {
      if (pattern.test(url)) {
        const { url: targetUrl, filename } = fn(url);
        const { stream, filename: finalName } = await streamDownload(targetUrl, filename);

        return new NextResponse(stream, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(finalName)}"`,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    // 兜底：直接代理
    const { stream, filename } = await streamDownload(url, 'model.stl');
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[proxy-download] 失败:', err);
    return NextResponse.json(
      { error: '下载失败，请检查链接是否有效，或复制到浏览器手动下载：\n' + url },
      { status: 502 }
    );
  }
}
