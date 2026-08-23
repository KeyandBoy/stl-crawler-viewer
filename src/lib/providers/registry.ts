// Provider 注册表 — 统一管理所有站点适配器

import type { ProviderAdapter } from './types';
import { ThingiverseProvider } from './thingiverse';
import { PrintablesProvider } from './printables';

const providers = new Map<string, ProviderAdapter>();

function register(p: ProviderAdapter): void {
  providers.set(p.id, p);
}

// 注册所有内置 Provider
register(new ThingiverseProvider());
register(new PrintablesProvider());

export function getProvider(id: string): ProviderAdapter | undefined {
  return providers.get(id);
}

export function getAllProviders(): ProviderAdapter[] {
  return [...providers.values()];
}

export function getSearchableProviders(): ProviderAdapter[] {
  return [...providers.values()];
}
