// 站点配置：统一的站点 ID、展示名称与抓取参数

export interface SiteDefinition {
  id: string;
  name: string;
  /** 是否需要登录 Cookie 才能下载 */
  needCookie?: boolean;
  /** 推荐使用 API Token 的站点（说明文案） */
  apiTokenLabel?: string;
  /** 搜索 URL 构造函数 */
  searchUrl: (keyword: string) => string;
  /** 详情页域名判断 */
  domainIncludes: string[];
}

export const SITE_THINGIVERSE = 'thingiverse';
export const SITE_PRINTABLES = 'printables';
export const SITE_AIGEI = 'aigei';
export const SITE_3D66 = '3d66';
export const SITE_SKETCHFAB = 'sketchfab';
export const SITE_YEGGI = 'yeggi';

/** Thingiverse 官方 API Token 在配置存储中的键名 */
export const KEY_THINGIVERSE_API_TOKEN = 'thingiverse_token';

export const STL_SITES: SiteDefinition[] = [
  {
    id: SITE_THINGIVERSE,
    name: 'Thingiverse',
    needCookie: true,
    apiTokenLabel: '推荐用官方 API Token（更稳定、不需要复制 Cookie）：登录 thingiverse.com → 打开 thingiverse.com/developers → 点 "Create an App" → 创建后页面会显示 Access Token，复制粘贴到这里。',
    domainIncludes: ['thingiverse.com'],
    searchUrl: (kw) => `https://www.thingiverse.com/search?q=${encodeURIComponent(kw)}&type=things&sort=relevant`,
  },
  {
    id: SITE_PRINTABLES,
    name: 'Printables',
    needCookie: true,
    domainIncludes: ['printables.com'],
    searchUrl: (kw) => `https://www.printables.com/search/models?q=${encodeURIComponent(kw)}`,
  },
  {
    id: SITE_AIGEI,
    name: '爱给网',
    needCookie: true,
    domainIncludes: ['aigei.com'],
    searchUrl: (kw) => `https://www.aigei.com/s?q=${encodeURIComponent(kw)}&type=3d`,
  },
  {
    id: SITE_3D66,
    name: '3D溜溜网',
    needCookie: true,
    domainIncludes: ['3d66.com'],
    searchUrl: (kw) => `https://3d.3d66.com/model/${encodeURIComponent(`${kw}stl`)}_1.html?sws=1`,
  },
  {
    id: SITE_SKETCHFAB,
    name: 'Sketchfab',
    needCookie: true,
    domainIncludes: ['sketchfab.com'],
    searchUrl: (kw) => `https://sketchfab.com/search?q=${encodeURIComponent(kw)}&type=models`,
  },
  {
    id: SITE_YEGGI,
    name: 'Yeggi',
    needCookie: false,
    domainIncludes: ['yeggi.com'],
    searchUrl: (kw) => `https://www.yeggi.com/q/${encodeURIComponent(`${kw} stl`)}/`,
  },
];

/** 根据 URL 判断所属站点 ID */
export function detectSiteId(url: string): string | undefined {
  const u = url.toLowerCase();
  return STL_SITES.find((s) => s.domainIncludes.some((d) => u.includes(d)))?.id;
}

export function getSiteDef(siteId: string): SiteDefinition | undefined {
  return STL_SITES.find((s) => s.id === siteId);
}
