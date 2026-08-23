import { NextRequest, NextResponse } from 'next/server';
import { crawlRequest } from '@/lib/crawler/http';
import { getSiteCookie } from '@/lib/siteCookies';
import { KEY_THINGIVERSE_API_TOKEN } from '@/lib/siteConfig';

/**
 * POST { siteId }
 * 测试该站点配置是否可用（API Token / Cookie）。
 */
export async function POST(request: NextRequest) {
  try {
    const { siteId } = await request.json();
    if (!siteId) return NextResponse.json({ error: '缺少 siteId' }, { status: 400 });

    switch (siteId) {
      case 'thingiverse': {
        const token = await getSiteCookie(KEY_THINGIVERSE_API_TOKEN);
        if (token) {
          try {
            const { data } = await crawlRequest(
              'https://api.thingiverse.com/search/things/dragon?type=things',
              'thingiverse',
              {
                withCookies: false,
                maxRetries: 0,
                timeout: 10000,
                responseType: 'json',
                extraHeaders: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
              },
            );
            const hits = (data as { hits?: unknown[] } | null)?.hits?.length ?? 0;
            return NextResponse.json({
              success: true,
              method: 'API Token',
              message: `API Token 有效，测试搜索返回 ${hits} 个结果`,
            });
          } catch {
            return NextResponse.json({ success: false, method: 'API Token', message: 'API Token 无效或已过期，请检查后重新粘贴' });
          }
        }
        // 无 Token，测 Cookie
        const cookie = await getSiteCookie('thingiverse');
        if (!cookie) {
          return NextResponse.json({ success: false, method: '未配置', message: '尚未配置 Thingiverse 的 API Token 或 Cookie' });
        }
        try {
          const { status } = await crawlRequest('https://www.thingiverse.com/', 'thingiverse', { maxRetries: 0, timeout: 10000 });
          if (status === 403 || status === 401) {
            return NextResponse.json({ success: false, method: 'Cookie', message: 'Cookie 无效（返回 403/401）' });
          }
          return NextResponse.json({ success: true, method: 'Cookie', message: 'Cookie 已携带，可正常访问（是否登录成功请以搜索结果为准）' });
        } catch {
          return NextResponse.json({ success: false, method: 'Cookie', message: '访问失败，Cookie 可能无效' });
        }
      }

      case 'printables':
      case 'aigei': {
        const cookie = await getSiteCookie(siteId);
        if (!cookie) {
          return NextResponse.json({ success: false, method: '未配置', message: `尚未配置 ${siteId} 的 Cookie` });
        }
        const url = siteId === 'printables'
          ? 'https://www.printables.com/search/models?q=dragon'
          : 'https://www.aigei.com/s?q=%E9%BE%99&type=3d';
        try {
          const { status } = await crawlRequest(url, siteId, { maxRetries: 0, timeout: 10000 });
          if (status === 403 || status === 401) {
            return NextResponse.json({ success: false, method: 'Cookie', message: 'Cookie 无效（返回 403/401）' });
          }
          return NextResponse.json({ success: true, method: 'Cookie', message: 'Cookie 已携带，可正常访问（是否登录成功请以搜索结果为准）' });
        } catch {
          return NextResponse.json({ success: false, method: 'Cookie', message: '访问失败，Cookie 可能无效' });
        }
      }

      default:
        return NextResponse.json({ success: false, message: '暂不支持该站点测试' });
    }
  } catch (e) {
    console.error('[test-site] 错误:', e);
    return NextResponse.json({ success: false, message: '测试失败' }, { status: 500 });
  }
}
