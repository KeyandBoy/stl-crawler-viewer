'use client';

export interface ResolvedDownload {
  success: boolean;
  downloadUrl?: string;
  filename?: string;
  hint?: string;
  title?: string;
  error?: string;
}

/** 解析详情页 → 真实文件直链 */
export async function resolveDownload(detailUrl: string, siteId?: string, title?: string): Promise<ResolvedDownload> {
  const res = await fetch('/api/resolve-download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: detailUrl, siteId, title }),
  });
  return res.json();
}

/** 通过代理下载文件，返回 Blob 与真实文件名（来自 Content-Disposition） */
export async function fetchViaProxy(url: string, referer?: string): Promise<{ blob: Blob; filename?: string }> {
  const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `下载失败：${res.status}` }));
    throw new Error(err.error || `下载失败：${res.status}`);
  }
  const blob = await res.blob();
  let filename: string | undefined;
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*?=(?:UTF-8''|")([^";]+)(")?/i);
  if (m?.[1]) {
    try { filename = decodeURIComponent(m[1]); } catch { filename = m[1]; }
  }
  return { blob, filename };
}

/** 触发浏览器保存（用户自选保存位置） */
export function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

/** 保存到模型库（Vercel Blob / 本地） */
export async function saveToLibrary(url: string, title?: string, filename?: string, ownerToken?: string) {
  const res = await fetch('/api/save-to-library', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ownerToken ? { 'x-owner-token': ownerToken } : {}),
    },
    body: JSON.stringify({ url, title, filename }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || '保存到模型库失败');
  }
  return data;
}

/** 批量下载：逐一下载到内存 → JSZip 打包为 zip */
export async function batchDownloadAsZip(
  items: Array<{ url: string; filename: string }>,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const used = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i, items.length, item.filename);
    try {
      const { blob, filename } = await fetchViaProxy(item.url);
      const name = uniqueName(filename || item.filename || `model_${i}.stl`, used);
      zip.file(name, blob);
    } catch (e) {
      console.warn(`批量下载跳过：${item.filename}`, e);
    }
    // 限速，避免触发反爬
    await new Promise((r) => setTimeout(r, 300));
  }

  return zip.generateAsync({ type: 'blob' });
}

function uniqueName(name: string, used: Set<string>): string {
  const m = name.match(/(.+)\.(stl|zip|obj|3mf)$/i);
  const base = m ? m[1] : name.replace(/\.[^.]+$/, '');
  const ext = m ? `.${m[2].toLowerCase()}` : '.stl';
  let final = `${base}${ext}`;
  let k = 1;
  while (used.has(final)) {
    final = `${base}_${k++}${ext}`;
  }
  used.add(final);
  return final;
}
