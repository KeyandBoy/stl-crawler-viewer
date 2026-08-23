import { NextRequest, NextResponse } from 'next/server';
import { loadSiteCookies, saveSiteCookies } from '@/lib/siteCookies';
import { STL_SITES, KEY_THINGIVERSE_API_TOKEN } from '@/lib/siteConfig';

/** GET：返回所有站点的 Cookie 状态（已配置/未配置）与已配置值 */
export async function GET() {
  try {
    const cookies = await loadSiteCookies();
    const sites = STL_SITES.map((s) => ({
      id: s.id,
      name: s.name,
      needCookie: !!s.needCookie,
      hasCookie: !!cookies[s.id],
      cookie: cookies[s.id] || '',
      hasApiToken: s.id === 'thingiverse' ? !!cookies[KEY_THINGIVERSE_API_TOKEN] : false,
      apiToken: s.id === 'thingiverse' ? (cookies[KEY_THINGIVERSE_API_TOKEN] || '') : '',
      apiTokenLabel: s.apiTokenLabel || '',
    }));
    return NextResponse.json({ success: true, sites });
  } catch (e) {
    console.error('[site-settings] GET 错误:', e);
    return NextResponse.json({ success: false, error: '读取站点配置失败' }, { status: 500 });
  }
}

/** POST：保存配置（Cookie + API Token，整体覆盖） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cookies = body.cookies && typeof body.cookies === 'object' ? body.cookies : {};
    const clean: Record<string, string> = {};
    for (const site of STL_SITES) {
      const val = cookies[site.id];
      if (typeof val === 'string' && val.trim()) clean[site.id] = val.trim();
    }
    // Thingiverse API Token
    const token = cookies[KEY_THINGIVERSE_API_TOKEN];
    if (typeof token === 'string' && token.trim()) clean[KEY_THINGIVERSE_API_TOKEN] = token.trim();

    await saveSiteCookies(clean);
    return NextResponse.json({ success: true, saved: Object.keys(clean) });
  } catch (e) {
    console.error('[site-settings] POST 错误:', e);
    return NextResponse.json({ success: false, error: '保存站点配置失败' }, { status: 500 });
  }
}
