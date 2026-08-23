// Printables Provider Adapter
// 支持页面静态解析 + __NEXT_DATA__ + 详情页文件发现

import * as cheerio from 'cheerio';
import { crawlRequest } from '@/lib/crawler/http';
import type {
  ProviderAdapter,
  ProviderSearchQuery,
  ModelSearchResult,
  ModelFile,
} from './types';

function cleanTitle(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

function absUrl(base: string, href: string): string {
  if (!href) return '';
  try { return new URL(href, base).href; } catch { return href.startsWith('http') ? href : `https:${href}`; }
}

function parseFileUrl(url: string): ModelFile {
  const filename = url.split('/').pop()?.split('?')[0] || 'model.stl';
  const ext = filename.split('.').pop()?.toLowerCase() || 'stl';
  return {
    url,
    filename,
    format: ext as ModelFile['format'],
  };
}

function collectFileUrlsFromJson(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectFileUrlsFromJson(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') {
      if (/(?:media|files)\.printables\.com/.test(v) && /\.(stl|3mf|obj|step|stp|zip)(\?|$)/i.test(v)) {
        out.push(v);
      }
    } else if (v && typeof v === 'object') {
      collectFileUrlsFromJson(v, out);
    }
  }
}

export class PrintablesProvider implements ProviderAdapter {
  readonly id = 'printables';
  readonly name = 'Printables';

  async search(query: ProviderSearchQuery): Promise<ModelSearchResult[]> {
    const results: ModelSearchResult[] = [];

    for (const variant of query.variants.slice(0, 3)) {
      if (results.length >= query.maxResults) break;
      try {
        const { data, status } = await crawlRequest(
          `https://www.printables.com/search/models?q=${encodeURIComponent(variant)}`,
          'printables',
          { maxRetries: 0, timeout: query.timeout },
        );
        if (status >= 400 || typeof data !== 'string') continue;

        const hits = this.parseSearchPage(data);
        for (const hit of hits) {
          const exists = results.some((r) => r.modelId === hit.modelId);
          if (!exists) results.push(hit);
        }
      } catch {
        // 单个变体失败不影响其他
      }
    }
    return results.slice(0, query.maxResults);
  }

  private parseSearchPage(html: string): ModelSearchResult[] {
    const results: ModelSearchResult[] = [];
    const seen = new Set<string>();
    const $ = cheerio.load(html);

    // 方式一：锚点
    $('a[href*="/model/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/model\/(\d+)/);
      const id = m?.[1];
      if (!id || seen.has(id)) return;
      seen.add(id);

      const title = cleanTitle(
        $(el).attr('title') ||
          $(el).find('[class*="title"], h3, h4, span').first().text() ||
          $(el).find('img').attr('alt') ||
          `Printables 模型 #${id}`,
      );
      if (title.length < 3) return;

      results.push({
        id: `printables-${id}`,
        provider: 'printables',
        modelId: id,
        title,
        description: title,
        thumbnail: $(el).find('img').attr('src') || undefined,
        resultKind: 'model',
        strategy: 'server_http',
        detailUrl: absUrl('https://www.printables.com', href),
        access: 'unknown',
        resolution: 'unresolved',
        downloadCapability: 'resolve_detail',
        requiresLogin: false,
      });
    });

    // 方式二：__NEXT_DATA__
    try {
      const script = $('script#__NEXT_DATA__').first().text();
      if (script) {
        const json = JSON.parse(script);
        const models = this.findModelsInJson(json);
        for (const m of models) {
          if (seen.has(m.id) || results.length >= 8) continue;
          seen.add(m.id);
          results.push({
            id: `printables-${m.id}`,
            provider: 'printables',
            modelId: m.id,
            title: m.name || `Printables 模型 #${m.id}`,
            description: m.name || '',
            thumbnail: m.thumbnail || undefined,
            resultKind: 'model',
            strategy: 'server_http',
            detailUrl: `https://www.printables.com/model/${m.id}`,
            access: 'unknown',
            resolution: 'unresolved',
            downloadCapability: 'resolve_detail',
            requiresLogin: false,
          });
        }
      }
    } catch { /* ignore */ }

    return results;
  }

  private findModelsInJson(
    node: unknown,
  ): Array<{ id: string; name?: string; thumbnail?: string }> {
    const out: Array<{ id: string; name?: string; thumbnail?: string }> = [];
    if (!node || typeof node !== 'object') return out;

    const obj = node as Record<string, unknown>;
    if (Array.isArray(node)) {
      for (const item of node) out.push(...this.findModelsInJson(item));
      return out;
    }

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (key === 'models' || key === 'results' || key === 'hits' || key === 'items' || key === 'data') {
        if (Array.isArray(val)) {
          for (const item of val) {
            const rec = item as Record<string, unknown>;
            const id = String(rec.id || rec.modelId || '');
            if (id && /^\d+$/.test(id)) {
              out.push({
                id,
                name: rec.name as string | undefined,
                thumbnail: (rec.thumbnail as string) || (rec.image as string) || undefined,
              });
            }
          }
        }
      }
      if (val && typeof val === 'object') out.push(...this.findModelsInJson(val));
    }
    return out;
  }

  async resolveFiles(result: ModelSearchResult): Promise<ModelSearchResult> {
    if (!result.detailUrl) return { ...result, resolution: 'failed' };

    const id = result.modelId || result.detailUrl.match(/\/model\/(\d+)/)?.[1];
    if (!id) return { ...result, resolution: 'failed' };

    // 1. 抓取详情页，从 HTML / __NEXT_DATA__ 中发现 CDN 直链
    try {
      const { data, status } = await crawlRequest(result.detailUrl, 'printables', {
        maxRetries: 0,
        timeout: 12000,
      });
      if (status === 200 && typeof data === 'string') {
        const files = this.extractFilesFromPage(String(data));
        if (files.length > 0) {
          return { ...result, files, resolution: 'resolved', access: 'free' };
        }
      }
    } catch { /* 继续尝试 */ }

    // 2. 尝试 /download 接口
    try {
      const dlUrl = `https://www.printables.com/model/${id}/download`;
      const { status } = await crawlRequest(dlUrl, 'printables', {
        maxRetries: 0,
        timeout: 8000,
        responseType: 'arraybuffer',
      });
      if (status === 200) {
        return {
          ...result,
          files: [{ url: dlUrl, filename: `printables-${id}.zip`, format: 'zip' }],
          resolution: 'resolved',
          access: 'login_required',
          requiresLogin: true,
        };
      }
    } catch { /* 继续 */ }

    return { ...result, resolution: 'failed' };
  }

  private extractFilesFromPage(html: string): ModelFile[] {
    const seen = new Set<string>();
    const files: ModelFile[] = [];
    const $ = cheerio.load(html);

    // 从 __NEXT_DATA__ 收集
    try {
      const script = $('script#__NEXT_DATA__').first().text();
      if (script) collectFileUrlsFromJson(JSON.parse(script), []);
    } catch { /* ignore */ }

    // 从锚点收集
    $('a[href*="media.printables.com"], a[href*="files.printables.com"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (/\.(stl|3mf|obj|step|stp|zip)(\?|$)/i.test(href) && !seen.has(href)) {
        seen.add(href);
        files.push(parseFileUrl(href));
      }
    });

    // 从内联脚本收集
    const scriptText = $('script').map((_, el) => $(el).html() || '').get().join('\n');
    const urlMatches = scriptText.match(/https?:\/\/(?:media|files)\.printables\.com[^'"\s<>]+?\.(?:stl|3mf|obj|step|stp|zip)(?:\?[^'"\s<>]*)?/gi) || [];
    for (const u of urlMatches) {
      if (!seen.has(u)) {
        seen.add(u);
        files.push(parseFileUrl(u));
      }
    }

    return files;
  }
}
