import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { Readable } from 'stream';
import { getSiteCookie } from '@/lib/siteCookies';
import { detectSiteId, KEY_THINGIVERSE_API_TOKEN } from '@/lib/siteConfig';

// ===================== 已知可直接下载的文件域名 =====================
const DIRECT_DL_PATTERNS = [
  { pattern: /down\.aigei\.com/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'ancient-architecture.stl') }) },
  { pattern: /down\.3d66\.com/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'arch-model.stl') }) },
  { pattern: /down\.cgmodel\.com/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'cg-model.stl') }) },
  { pattern: /thingiverse\.com\/thing:\d+\/zip/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'thingiverse-model.zip') }) },
  { pattern: /thingiverse\.com\/download:/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'thingiverse-model.stl') }) },
  { pattern: /printables\.com\/model\/\d+\/download/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'printables-model.zip') }) },
  { pattern: /\.(stl|zip|obj|3mf|step|stp)(?:$|[?#])/i, fn: (url: string) => ({ url, filename: extractFilename(url, 'model.stl') }) },
];

// 从 URL 提取文件名
function extractFilename(url: string, fallback: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /\.(stl|zip|obj|3ds|fbx|dae|3mf|step|stp)$/i.test(last)) return last;
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

// ===================== 通用下载流（带站点 Cookie）=====================
async function streamDownload(
  targetUrl: string,
  filename: string,
  referer?: string,
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string; contentType: string }> {
  const siteId = detectSiteId(targetUrl);
  const cookie = siteId ? await getSiteCookie(siteId) : '';
  // Thingiverse 官方 API 下载地址需带 API Token
  const apiToken = /api\.thingiverse\.com/i.test(targetUrl) ? await getSiteCookie(KEY_THINGIVERSE_API_TOKEN) : '';

  const response = await axios.get(targetUrl, {
    timeout: 30000,
    responseType: 'stream',
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      'Referer': referer || (() => {
        try { return new URL(targetUrl).origin + '/'; } catch { return ''; }
      })(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {}),
    },
  });

  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('目标链接返回网页或 JSON，不是真实模型文件');
  }

  // 尝试从响应头取真实文件名
  const cd = response.headers['content-disposition'] as string | undefined;
  if (cd && cd.includes('filename')) {
    const match = cd.match(/filename\*?=(?:UTF-8'')?['"]?([^'";\n]+)['"]?/i);
    if (match?.[1]) {
      try {
        filename = decodeURIComponent(match[1].trim());
      } catch {
        filename = match[1].trim();
      }
    }
  }

  return { stream: nodeStreamToWebStream(response.data as Readable), filename, contentType };
}

// ===================== SSRF 校验 =====================
function validateUrl(rawUrl: string): { url: string; error?: string } {
  if (!rawUrl) return { url: '', error: '缺少下载链接参数' };
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { url: '', error: '只支持 http/https 协议' };
    }
    // 禁止内网地址（防 SSRF）
    const host = parsed.hostname;
    if (
      host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
      /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) || /^0\./.test(host)
    ) {
      return { url: '', error: '不允许访问内网地址' };
    }
    return { url: rawUrl };
  } catch {
    return { url: '', error: '无效的 URL 格式' };
  }
}

// ===================== 主路由 =====================
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url') || '';
  const referer = request.nextUrl.searchParams.get('referer') || undefined;

  const { url, error } = validateUrl(rawUrl);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    // 匹配已知下载模式
    for (const { pattern, fn } of DIRECT_DL_PATTERNS) {
      if (pattern.test(url)) {
        const { url: targetUrl, filename } = fn(url);
        const { stream, filename: finalName, contentType } = await streamDownload(targetUrl, filename, referer);

        return new NextResponse(stream, {
          status: 200,
          headers: {
            'Content-Type': contentType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(finalName)}"`,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    // 兜底：直接代理
    const { stream, filename, contentType } = await streamDownload(url, 'model.stl', referer);
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[proxy-download] 失败:', err instanceof Error ? err.message : err);
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: '目标站点要求登录：请到「站点设置」页配置对应站点 Cookie 后重试' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: '下载失败，请检查链接是否有效，或复制到浏览器手动下载：\n' + url },
      { status: 502 },
    );
  }
}
