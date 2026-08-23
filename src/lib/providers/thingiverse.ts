// Thingiverse Provider Adapter
// 支持官方 API 搜索 + 页面静态解析 + 文件列表解析

import * as cheerio from 'cheerio';
import { crawlRequest } from '@/lib/crawler/http';
import { getSiteCookie } from '@/lib/siteCookies';
import { KEY_THINGIVERSE_API_TOKEN } from '@/lib/siteConfig';
import type {
  ProviderAdapter,
  ProviderSearchQuery,
  ModelSearchResult,
  ModelFile,
} from './types';

const THINGIVERSE_API = 'https://api.thingiverse.com';

function cleanTitle(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

function thingIdFromUrl(url: string): string | undefined {
  const m = url.match(/thing:(\d+)/);
  return m?.[1];
}

function extractFiles(data: unknown): ModelFile[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((f: Record<string, unknown>) => {
      const name = String(f.name || '');
      return /\.(stl|zip|3mf|obj)$/i.test(name);
    })
    .map((f: Record<string, unknown>) => {
      const name = String(f.name || '');
      const ext = name.split('.').pop()?.toLowerCase() || 'stl';
      return {
        url: String(f.download_url || f.url || ''),
        filename: name,
        format: ext as ModelFile['format'],
        size: typeof f.size === 'number' ? f.size : undefined,
      };
    })
    .filter((f) => f.url);
}

export class ThingiverseProvider implements ProviderAdapter {
  readonly id = 'thingiverse';
  readonly name = 'Thingiverse';

  async search(query: ProviderSearchQuery): Promise<ModelSearchResult[]> {
    const results: ModelSearchResult[] = [];

    // 1. 尝试官方 API 搜索
    const apiResults = await this.searchByApi(query);
    results.push(...apiResults);

    // 2. 对剩余关键词用页面解析补充
    if (results.length < query.maxResults) {
      const pageResults = await this.searchByPage(query, results.length);
      results.push(...pageResults);
    }

    return results.slice(0, query.maxResults);
  }

  private async searchByApi(query: ProviderSearchQuery): Promise<ModelSearchResult[]> {
    const token = await getSiteCookie(KEY_THINGIVERSE_API_TOKEN);
    if (!token) return [];

    const results: ModelSearchResult[] = [];

    for (const variant of query.variants.slice(0, 3)) {
      if (results.length >= query.maxResults) break;
      try {
        const { data, status } = await crawlRequest(
          `${THINGIVERSE_API}/search/things/${encodeURIComponent(variant)}?type=things`,
          'thingiverse',
          {
            withCookies: false,
            maxRetries: 0,
            timeout: query.timeout,
            responseType: 'json',
            extraHeaders: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          },
        );

        if (status !== 200) continue;
        const payload = data as { hits?: unknown[] } | null;
        const hits = payload?.hits ?? [];

        for (const raw of hits) {
          const t = raw as Record<string, unknown>;
          const id = t.id as number | undefined;
          const name = String(t.name || '');
          if (!id || !name) continue;

          const modelId = String(id);
          const exists = results.some((r) => r.modelId === modelId);
          if (exists) continue;

          const thumb =
            (t.thumbnail as string) ||
            ((t.default_image as Record<string, unknown>)?.thumb as string) ||
            '';

          results.push({
            id: `thingiverse-${modelId}`,
            provider: 'thingiverse',
            modelId,
            title: cleanTitle(name),
            description: cleanTitle(name),
            thumbnail: thumb || undefined,
            resultKind: 'model',
            strategy: 'official_api',
            detailUrl: `https://www.thingiverse.com/thing:${modelId}`,
            access: 'unknown',
            resolution: 'unresolved',
            downloadCapability: 'resolve_detail',
            requiresLogin: true,
          });
        }
      } catch {
        // API 变体失败则继续下一个
      }
    }
    return results;
  }

  private async searchByPage(query: ProviderSearchQuery, existingCount: number): Promise<ModelSearchResult[]> {
    const results: ModelSearchResult[] = [];
    const searchVariants = query.variants.slice(0, 2);

    for (const variant of searchVariants) {
      if (results.length + existingCount >= query.maxResults) break;
      try {
        const { data, status } = await crawlRequest(
          `https://www.thingiverse.com/search?q=${encodeURIComponent(variant)}&type=things&sort=relevant`,
          'thingiverse',
          { maxRetries: 0, timeout: query.timeout },
        );
        if (status >= 400 || typeof data !== 'string') continue;

        const hits = this.parseSearchPage(data);
        for (const hit of hits) {
          const exists = results.some((r) => r.modelId === hit.modelId);
          if (!exists) results.push(hit);
        }
      } catch {
        // 页面解析失败则继续
      }
    }
    return results;
  }

  private parseSearchPage(html: string): ModelSearchResult[] {
    const results: ModelSearchResult[] = [];
    const seen = new Set<string>();
    const $ = cheerio.load(html);

    // 方式一：锚点解析
    $('a[href*="/thing:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const id = thingIdFromUrl(href);
      if (!id || seen.has(id)) return;

      const title = cleanTitle(
        $(el).attr('title') ||
          $(el).find('[class*="title"], h3, h4, span').first().text() ||
          $(el).text().split('\n')[0],
      );
      if (title.length < 3) return;
      seen.add(id);

      results.push({
        id: `thingiverse-${id}`,
        provider: 'thingiverse',
        modelId: id,
        title,
        description: title,
        thumbnail: $(el).find('img').attr('src') || undefined,
        resultKind: 'model',
        strategy: 'server_http',
        detailUrl: `https://www.thingiverse.com/thing:${id}`,
        access: 'unknown',
        resolution: 'unresolved',
        downloadCapability: 'resolve_detail',
        requiresLogin: true,
      });
    });

    // 方式二：__NEXT_DATA__
    try {
      const script = $('script#__NEXT_DATA__').first().text();
      if (script) {
        const json = JSON.parse(script);
        const things = this.findThingsInJson(json);
        for (const t of things) {
          const tid = String(t.id);
          if (seen.has(tid) || results.length >= 8) continue;
          seen.add(tid);

          results.push({
            id: `thingiverse-${tid}`,
            provider: 'thingiverse',
            modelId: tid,
            title: cleanTitle(t.name || t.title || `Thingiverse 模型 #${tid}`),
            description: cleanTitle(t.name || t.title || ''),
            thumbnail: t.thumbnail || undefined,
            resultKind: 'model',
            strategy: 'server_http',
            detailUrl: `https://www.thingiverse.com/thing:${tid}`,
            access: 'unknown',
            resolution: 'unresolved',
            downloadCapability: 'resolve_detail',
            requiresLogin: true,
          });
        }
      }
    } catch { /* ignore */ }

    return results;
  }

  private findThingsInJson(
    node: unknown,
  ): Array<{ id: string | number; name?: string; title?: string; thumbnail?: string }> {
    const out: Array<{ id: string | number; name?: string; title?: string; thumbnail?: string }> = [];
    if (!node || typeof node !== 'object') return out;

    const obj = node as Record<string, unknown>;

    if (Array.isArray(node)) {
      for (const item of node) out.push(...this.findThingsInJson(item));
      return out;
    }

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (key === 'things' || key === 'results' || key === 'hits' || key === 'items' || key === 'data') {
        if (Array.isArray(val)) {
          for (const item of val) {
            const rec = item as Record<string, unknown>;
            const id = (rec.thingId ?? rec.id) as string | number | undefined;
            if (id && (rec.name || rec.title)) {
              out.push({
                id,
                name: rec.name as string,
                title: rec.title as string,
                thumbnail: (rec.thumbnail as string) || (rec.image as string),
              });
            }
          }
        }
      }
      if (val && typeof val === 'object') out.push(...this.findThingsInJson(val));
    }
    return out;
  }

  async resolveFiles(result: ModelSearchResult): Promise<ModelSearchResult> {
    const id = result.modelId || thingIdFromUrl(result.detailUrl || '');

    // 1. 尝试官方 API 获取文件列表
    const apiFiles = await this.resolveFilesByApi(id);
    if (apiFiles.length > 0) {
      return {
        ...result,
        files: apiFiles,
        resolution: 'resolved',
        access: 'unknown',
      };
    }

    // 2. 尝试预检 ZIP 下载
    const zipResult = await this.resolveByZip(id);
    if (zipResult) {
      return {
        ...result,
        files: [zipResult],
        resolution: 'resolved',
        access: 'unknown',
      };
    }

    return { ...result, resolution: 'failed' };
  }

  private async resolveFilesByApi(id: string | undefined): Promise<ModelFile[]> {
    if (!id) return [];
    const token = await getSiteCookie(KEY_THINGIVERSE_API_TOKEN);
    if (!token) return [];

    try {
      const { data, status } = await crawlRequest(
        `${THINGIVERSE_API}/things/${id}/files`,
        'thingiverse',
        {
          withCookies: false,
          maxRetries: 0,
          timeout: 10000,
          responseType: 'json',
          extraHeaders: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );
      if (status !== 200) return [];
      return extractFiles(data);
    } catch {
      return [];
    }
  }

  private async resolveByZip(id: string | undefined): Promise<ModelFile | null> {
    if (!id) return null;
    const zipUrl = `https://www.thingiverse.com/thing:${id}/zip`;

    try {
      const { data, status, headers } = await crawlRequest(zipUrl, 'thingiverse', {
        maxRetries: 0,
        timeout: 8000,
        responseType: 'stream',
      });
      const ct = (headers as Record<string, unknown>)['content-type'] as string | undefined;
      (data as { destroy?: () => void })?.destroy?.();

      if (status >= 400 || (ct && (ct.includes('text/html') || ct.includes('application/json')))) {
        return null;
      }

      return {
        url: zipUrl,
        filename: `thingiverse-${id}.zip`,
        format: 'zip',
      };
    } catch {
      return null;
    }
  }
}
