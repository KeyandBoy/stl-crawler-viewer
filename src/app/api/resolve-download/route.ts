import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteDetail } from '@/lib/crawler/sites';
import { detectSiteId } from '@/lib/siteConfig';

/**
 * POST { url, siteId?, title? }
 * 解析详情页，返回真实可下载的文件直链。
 */
export async function POST(request: NextRequest) {
  try {
    const { url, siteId, title } = await request.json();
    if (!url) return NextResponse.json({ error: '缺少详情页 URL' }, { status: 400 });

    const sid = siteId || detectSiteId(url);
    if (!sid) return NextResponse.json({ error: '无法识别来源站点' }, { status: 400 });
    if (detectSiteId(url) !== sid) {
      return NextResponse.json({ error: '来源站点与 URL 域名不匹配' }, { status: 400 });
    }

    const resolved = await resolveSiteDetail(sid, url);
    return NextResponse.json({
      success: true,
      siteId: sid,
      detailUrl: url,
      downloadUrl: resolved.url,
      filename: resolved.filename,
      hint: resolved.hint,
      title: title || '',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '解析下载链接失败';
    console.error('[resolve-download] 解析失败:', e);
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    );
  }
}
