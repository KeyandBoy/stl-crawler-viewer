import axios, { AxiosRequestConfig } from 'axios';
import { getSiteCookie } from '@/lib/siteCookies';
import { detectSiteId } from '@/lib/siteConfig';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface CrawlOptions {
  timeout?: number;
  maxRetries?: number;
  responseType?: 'arraybuffer' | 'stream' | 'json' | 'text';
  referer?: string;
  extraHeaders?: Record<string, string>;
  /** 是否附带站点 Cookie（默认 true） */
  withCookies?: boolean;
}

/**
 * 统一的站点抓取请求：
 * - 自动附带对应站点 Cookie
 * - 浏览器指纹请求头
 * - 403/429/5xx 指数退避重试
 * - 返回 axios response（text/arraybuffer 等由调用方决定）
 */
export async function crawlRequest(
  url: string,
  siteId?: string,
  options: CrawlOptions = {},
): Promise<{ data: unknown; status: number; headers: unknown }> {
  const sid = siteId || detectSiteId(url);
  const cookie = options.withCookies === false ? '' : sid ? await getSiteCookie(sid) : '';

  const maxRetries = options.maxRetries ?? 3;
  const timeout = options.timeout ?? 15000;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const config: AxiosRequestConfig = {
        timeout,
        responseType: options.responseType,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': options.referer || (url.startsWith('http') ? new URL(url).origin + '/' : ''),
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(options.extraHeaders || {}),
        },
      };

      const resp = await axios.get(url, config);

      // 4xx / 5xx 重试
      if (resp.status >= 400) {
        lastErr = new Error(`HTTP ${resp.status}`);
        if (shouldRetry(resp.status) && attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        return { data: resp.data, status: resp.status, headers: resp.headers };
      }

      return { data: resp.data, status: resp.status, headers: resp.headers };
    } catch (err) {
      lastErr = err;
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status && shouldRetry(status) && attempt < maxRetries) {
        await sleep(backoff(attempt));
        continue;
      }
      // 网络错误也重试
      if (!status && attempt < maxRetries) {
        await sleep(backoff(attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

function shouldRetry(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

function backoff(attempt: number): number {
  return 500 * Math.pow(2, attempt) + Math.random() * 300;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 对一批 URL 做限速串行抓取（防止触发反爬） */
export async function crawlSequential<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  delayMs = 600,
): Promise<void> {
  for (const item of items) {
    await fn(item);
    await sleep(delayMs);
  }
}
