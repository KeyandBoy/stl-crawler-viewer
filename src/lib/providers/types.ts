// 统一 Provider 类型定义

export type FetchStrategy = 'official_api' | 'server_http' | 'local_browser' | 'external';

export type ResultKind = 'model' | 'search_suggestion' | 'tip';

export type AccessLevel = 'free' | 'login_required' | 'paid' | 'unknown';

export type ResolutionStatus = 'unresolved' | 'resolved' | 'failed';

export type DownloadCapability =
  | 'direct_file'
  | 'resolve_detail'
  | 'browser_click'
  | 'external_only';

export type FileFormat = 'stl' | 'zip' | '3mf' | 'obj' | 'step' | 'other';

export interface ModelFile {
  url: string;
  filename: string;
  format: FileFormat;
  size?: number;
}

export interface ModelSearchResult {
  id: string;
  provider: string;
  modelId?: string;

  title: string;
  description: string;
  thumbnail?: string;

  resultKind: ResultKind;
  strategy: FetchStrategy;

  searchUrl?: string;
  detailUrl?: string;

  access: AccessLevel;
  resolution: ResolutionStatus;
  downloadCapability: DownloadCapability;

  files?: ModelFile[];
  requiresLogin?: boolean;
  requiresBrowser?: boolean;

  publishTime?: string;
  tags?: string[];
}

export interface ProviderSearchQuery {
  keyword: string;
  variants: string[];
  maxResults: number;
  timeout: number;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;

  search(query: ProviderSearchQuery): Promise<ModelSearchResult[]>;
  resolveFiles(result: ModelSearchResult): Promise<ModelSearchResult>;
}
