import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const USE_BLOB = !!BLOB_TOKEN;
const META_PATH = 'config/stl-library.json';
const LOCAL_META_PATH = path.join(process.cwd(), 'data', 'stl-library.json');

export type LibraryStatus = 'pending' | 'approved' | 'rejected';

export interface LibraryItemMeta {
  key: string;
  url: string;
  storage: 'blob' | 'local';
  originalFilename: string;
  suffix: string;
  prefix: string;
  status: LibraryStatus;
  ownerHash: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  category?: string;
  categorySource?: 'rule' | 'user' | 'unknown';
  displayName?: string;
  thumbnailUrl?: string;
}

interface LibraryMetadataFile {
  version: 1;
  items: LibraryItemMeta[];
}

export function isAdminKey(value: string | null | undefined): boolean {
  const expected = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || '';
  return !!expected && value === expected;
}

export function ownerHash(ownerToken: string | null | undefined): string {
  if (!ownerToken || ownerToken.length < 16) return '';
  const pepper = process.env.OWNER_HASH_PEPPER || process.env.ADMIN_KEY || 'local-dev-owner-pepper';
  return crypto.createHash('sha256').update(`${pepper}:${ownerToken}`).digest('hex');
}

export function sanitizeFilename(input: string, fallback = 'model.stl'): string {
  const base = path.basename(input || fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  const safe = base.replace(/\s+/g, '_').slice(0, 120) || fallback;
  return safe.toLowerCase().endsWith('.stl') ? safe : `${safe}.stl`;
}

export function makeDisplayFilename(meta: Pick<LibraryItemMeta, 'prefix' | 'suffix'>): string {
  const suffix = sanitizeFilename(meta.suffix || 'model.stl');
  const cleanPrefix = meta.prefix.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return cleanPrefix ? `${cleanPrefix}_${suffix}` : suffix;
}

export function canEditSuffix(meta: LibraryItemMeta, token: string | null | undefined): boolean {
  const hash = ownerHash(token);
  return !!hash && hash === meta.ownerHash;
}

export function canSeeItem(meta: LibraryItemMeta, token: string | null | undefined, adminKey?: string | null): boolean {
  return meta.status === 'approved' || canEditSuffix(meta, token) || isAdminKey(adminKey);
}

export async function readLibraryMetadata(): Promise<LibraryMetadataFile> {
  if (USE_BLOB) {
    try {
      const { list } = await import('@vercel/blob');
      const { blobs } = await list({ prefix: META_PATH, token: BLOB_TOKEN });
      const blob = blobs.find(b => b.pathname === META_PATH);
      if (!blob) return { version: 1, items: [] };
      const response = await fetch(blob.url, { headers: { Authorization: `Bearer ${BLOB_TOKEN}` } });
      if (!response.ok) return { version: 1, items: [] };
      const data = await response.json();
      if (data?.version === 1 && Array.isArray(data.items)) return data;
    } catch (error) {
      console.error('[libraryMetadata] read blob metadata failed:', error);
    }
    return { version: 1, items: [] };
  }

  try {
    if (!fs.existsSync(LOCAL_META_PATH)) return { version: 1, items: [] };
    const data = JSON.parse(fs.readFileSync(LOCAL_META_PATH, 'utf8'));
    if (data?.version === 1 && Array.isArray(data.items)) return data;
  } catch (error) {
    console.error('[libraryMetadata] read local metadata failed:', error);
  }
  return { version: 1, items: [] };
}

export async function writeLibraryMetadata(data: LibraryMetadataFile): Promise<void> {
  const content = JSON.stringify({ version: 1, items: data.items }, null, 2);
  if (USE_BLOB) {
    const { put } = await import('@vercel/blob');
    await put(META_PATH, content, {
      access: 'private',
      token: BLOB_TOKEN,
      contentType: 'application/json',
      allowOverwrite: true,
    });
    return;
  }

  const dir = path.dirname(LOCAL_META_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOCAL_META_PATH, content, 'utf8');
}

export async function upsertLibraryItem(meta: LibraryItemMeta): Promise<void> {
  const data = await readLibraryMetadata();
  const index = data.items.findIndex(item => item.key === meta.key);
  if (index >= 0) data.items[index] = meta;
  else data.items.push(meta);
  await writeLibraryMetadata(data);
}

export async function updateLibraryItem(key: string, patch: Partial<LibraryItemMeta>): Promise<LibraryItemMeta | null> {
  const data = await readLibraryMetadata();
  const item = data.items.find(entry => entry.key === key);
  if (!item) return null;
  Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  await writeLibraryMetadata(data);
  return item;
}

export async function removeLibraryItem(key: string): Promise<LibraryItemMeta | null> {
  const data = await readLibraryMetadata();
  const index = data.items.findIndex(item => item.key === key);
  if (index < 0) return null;
  const [removed] = data.items.splice(index, 1);
  await writeLibraryMetadata(data);
  return removed;
}

export async function getLibraryItem(key: string): Promise<LibraryItemMeta | null> {
  const data = await readLibraryMetadata();
  return data.items.find(item => item.key === key) || null;
}
