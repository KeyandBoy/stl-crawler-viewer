'use client';

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { STLModelCard } from '@/components/STLModelCard';
import { SiteSettings } from '@/components/SiteSettings';
import { resolveDownload, fetchViaProxy, triggerDownload, saveToLibrary, batchDownloadAsZip } from '@/lib/clientDownload';
import { CATEGORIES, classifyByRules, generateDisplayName, generateCategoryFilename, UNCLASSIFIED } from '@/lib/libraryRules';
import {
  Search, Download, Loader2, ExternalLink, Upload, RefreshCw,
  Globe, FileArchive, Image, FolderOpen,
  FolderSync, Package, Save, Circle, CheckSquare, Settings, Filter,
  CheckCircle2, X, BarChart3
} from 'lucide-react';

interface SearchResult {
  id: string;
  title: string;
  url: string;
  downloadUrl?: string;
  snippet: string;
  siteName: string;
  thumbnail?: string;
  verifiedFree?: boolean;
  isRecommendedSite?: boolean;
  isLocal?: boolean;
  publishTime?: string;
  isTip?: boolean;
  downloadMode?: 'direct' | 'detail' | 'login_required' | 'external_search' | 'paid' | 'resolve';
  requiresLogin?: boolean;
  canDirectDownload?: boolean;
  downloadHint?: string;
  sourceDetailUrl?: string;
  sourceSearchUrl?: string;
  isRealDetailPage?: boolean;
  siteId?: string;
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  hasResult?: boolean;
  emptyTip?: string;
  searchKeyword?: string;
  full?: boolean;
  cached?: boolean;
  sourceStats?: Record<string, number>;
}

interface StoredModel {
  key: string;
  url: string;
  filename: string;
  status?: 'pending' | 'approved' | 'rejected';
  canRenameSuffix?: boolean;
  canDelete?: boolean;
  canSetPrefix?: boolean;
  category?: string;
  displayName?: string;
  thumbnailUrl?: string;
}

const OWNER_TOKEN_KEY = 'stl-anonymous-owner-token';
const ADMIN_KEY_STORAGE = 'stl-admin-key';

function getOwnerToken(): string {
  let token = localStorage.getItem(OWNER_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem(OWNER_TOKEN_KEY, token);
  }
  return token;
}

function getAdminKey(promptIfMissing = false): string {
  const saved = localStorage.getItem(ADMIN_KEY_STORAGE) || '';
  if (saved || !promptIfMissing) return saved;
  const next = prompt('请输入管理员密钥（ADMIN_KEY）') || '';
  if (next) localStorage.setItem(ADMIN_KEY_STORAGE, next);
  return next;
}

const AGENT_TOKEN_KEY = 'stl-browser-agent-token';

function getAgentToken(): string {
  return localStorage.getItem(AGENT_TOKEN_KEY) || '';
}

const MODE_BADGE_MAP: Record<string, ReactNode> = {
  direct: <Badge className="bg-green-500 text-xs text-white">可直下</Badge>,
  resolve: <Badge className="bg-emerald-500 text-xs text-white">可解析</Badge>,
  login_required: <Badge className="bg-orange-500 text-xs text-white">需登录</Badge>,
  detail: <Badge className="bg-blue-500 text-xs text-white">详情页</Badge>,
  paid: <Badge className="bg-yellow-500 text-xs text-white">付费</Badge>,
  external_search: <Badge className="bg-gray-500 text-xs text-white">站点搜索</Badge>,
};

const BTN_STYLE_MAP: Record<string, string> = {
  direct: 'bg-green-600 hover:bg-green-700 text-white',
  resolve: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  login_required: 'bg-orange-500 hover:bg-orange-600 text-white',
  detail: 'bg-blue-600 hover:bg-blue-700 text-white',
  paid: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  external_search: 'bg-gray-500 hover:bg-gray-600 text-white',
};

const SITE_GRADIENTS: Record<string, string> = {
  thingiverse: 'bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500',
  printables: 'bg-gradient-to-br from-orange-600 via-red-500 to-rose-500',
  aigei: 'bg-gradient-to-br from-amber-500 via-orange-500 to-red-400',
  '3d66': 'bg-gradient-to-br from-teal-600 via-emerald-500 to-green-500',
  sketchfab: 'bg-gradient-to-br from-slate-800 via-blue-900 to-indigo-800',
  yeggi: 'bg-gradient-to-br from-purple-600 via-fuchsia-500 to-pink-500',
  library: 'bg-gradient-to-br from-emerald-600 via-teal-500 to-cyan-500',
  default: 'bg-gradient-to-br from-gray-500 via-slate-500 to-gray-600',
};

const btnStyleFor = (mode: string) => BTN_STYLE_MAP[mode] || 'bg-gray-500 hover:bg-gray-600 text-white';

const btnLabelFor = (mode: SearchResult['downloadMode'], isDownloading: boolean) => {
  switch (mode) {
    case 'direct': return isDownloading ? '处理中…' : '下载';
    case 'resolve': return isDownloading ? '解析中…' : '解析下载';
    case 'detail': return '详情页';
    case 'login_required': return '需登录';
    case 'paid': return '付费模型';
    case 'external_search': return '去站点搜';
    default: return '查看来源';
  }
};

const btnIconFor = (mode: SearchResult['downloadMode'], isDownloading: boolean) => {
  if (isDownloading && (mode === 'direct' || mode === 'resolve')) return <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />;
  if (mode === 'direct' || mode === 'resolve') return <Download className="w-3.5 h-3.5 mr-1" />;
  return <ExternalLink className="w-3.5 h-3.5 mr-1" />;
};

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingUrls, setDownloadingUrls] = useState<Set<string>>(new Set());
  const [emptyTip, setEmptyTip] = useState('');
  const [hasSearchResult, setHasSearchResult] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isBatchClassifying, setIsBatchClassifying] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [viewMode, setViewMode] = useState<'grid' | 'category'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatching, setIsBatching] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [detailResult, setDetailResult] = useState<SearchResult | null>(null);
  const [isSupplementing, setIsSupplementing] = useState(false);
  const [sourceStats, setSourceStats] = useState<Record<string, number>>({});
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('全部');
  const [uploadCategory, setUploadCategory] = useState('');
  const [resultFilter, setResultFilter] = useState<'all' | 'free' | 'download' | 'login' | 'paid'>('all');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);

  const HISTORY_KEY = 'stl-search-history';
  const HISTORY_MAX = 10;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(saved)) setSearchHistory(saved.filter(x => typeof x === 'string').slice(0, HISTORY_MAX));
    } catch { /* ignore */ }
  }, []);

  const saveSearchHistory = (kw: string) => {
    setSearchHistory(prev => {
      const next = [kw, ...prev.filter(x => x !== kw)].slice(0, HISTORY_MAX);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const clearSearchHistory = () => {
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
    setSearchHistory([]);
  };

  useEffect(() => { loadStoredModels(); }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, tone });
  };

  const loadStoredModels = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/list-stl', {
        headers: {
          'x-owner-token': getOwnerToken(),
          ...(getAdminKey(false) ? { 'x-admin-key': getAdminKey(false) } : {}),
        },
      });
      const data = await res.json();
      if (data.success) setStoredModels(data.files);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  };

  // 图书馆搜索过滤（文件名/Key 模糊匹配）
  const filteredModels = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return storedModels;
    return storedModels.filter(m =>
      m.filename.toLowerCase().includes(q) || m.key.toLowerCase().includes(q)
    );
  }, [storedModels, libraryQuery]);

  // 模型所属分类（优先元数据 category，否则按文件名前缀）
  const categoryOf = useCallback((model: StoredModel): string => {
    const c = (model as any).category;
    if (c) return c;
    const match = model.filename.match(/^([^/_]+)[/_]/);
    return match ? match[1] : '未分类';
  }, []);

  // 按分类分组模型 - 从 classifyResults 获取分类信息
  const categorizedModels = useMemo(() => {
    const categories: Record<string, StoredModel[]> = {};
    const uncategorized: StoredModel[] = [];
    
    for (const model of filteredModels) {
      const category = categoryOf(model);
      if (category === '未分类') {
        uncategorized.push(model);
      } else {
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(model);
      }
    }
    
    return { categories, uncategorized };
  }, [filteredModels, categoryOf]);

  // 分类筛选后的列表（网格视图用）
  const viewModels = useMemo(() => {
    if (libraryCategory === '全部') return filteredModels;
    return filteredModels.filter(m => categoryOf(m) === libraryCategory);
  }, [filteredModels, libraryCategory, categoryOf]);

  const libraryStats = useMemo(() => {
    const classified = storedModels.filter(model => categoryOf(model) !== '未分类').length;
    return {
      total: storedModels.length,
      classified,
      unclassified: storedModels.length - classified,
      categories: Object.entries(categorizedModels.categories).sort((a, b) => b[1].length - a[1].length),
    };
  }, [storedModels, categoryOf, categorizedModels.categories]);

  const visibleSearchResults = useMemo(() => {
    if (resultFilter === 'all') return searchResults;
    return searchResults.filter(result => {
      if (resultFilter === 'free') return result.isLocal || result.verifiedFree === true;
      if (resultFilter === 'download') return result.downloadMode === 'direct' || result.downloadMode === 'resolve';
      if (resultFilter === 'login') return result.downloadMode === 'login_required';
      return result.downloadMode === 'paid';
    });
  }, [searchResults, resultFilter]);

  const searchStats = useMemo(() => ({
    total: searchResults.length,
    free: searchResults.filter(result => result.isLocal || result.verifiedFree === true).length,
    downloadable: searchResults.filter(result => result.downloadMode === 'direct' || result.downloadMode === 'resolve').length,
    paid: searchResults.filter(result => result.downloadMode === 'paid').length,
  }), [searchResults]);

  const performSearch = async (q: string) => {
    if (!q.trim()) { alert('请输入搜索关键词！'); return; }
    q = q.trim();
    saveSearchHistory(q);
    setSearchResults([]);
    setEmptyTip('');
    setHasSearchResult(true);
    setIsSearching(true);
    setIsSupplementing(false);
    setSourceStats({});
    setResultFilter('all');

    // 阶段1：快速层（本地库 + 精选，毫秒级）
    let full = false;
    try {
      const res = await fetch('/api/search-stl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAgentToken() ? { 'x-browser-agent-token': getAgentToken() } : {}),
        },
        body: JSON.stringify({ query: q, count: 30, phase: 'fast' }),
      });
      const data = await res.json() as SearchResponse;
      if (data.success) {
        setSearchResults(data.results || []);
        setHasSearchResult(data.hasResult ?? true);
        setEmptyTip(data.emptyTip ?? '');
        setSearchKeyword(data.searchKeyword || q);
        full = !!data.full;
      }
    } catch {
      setHasSearchResult(false);
      setEmptyTip('搜索失败，请检查网络后重试');
    } finally {
      setIsSearching(false);
    }

    // 阶段2：深度层（爬虫结果，到了再追加；失败不影响已显示结果）
    if (full) return;
    setIsSupplementing(true);
    try {
      const res = await fetch('/api/search-stl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAgentToken() ? { 'x-browser-agent-token': getAgentToken() } : {}),
        },
        body: JSON.stringify({ query: q, count: 30, phase: 'deep' }),
      });
      const data = await res.json() as SearchResponse;
      if (data.success) {
        setSearchResults(prev => {
          const seen = new Set(prev.map(r => r.downloadUrl || r.url));
          return [...prev, ...(data.results || []).filter(r => !seen.has(r.downloadUrl || r.url))];
        });
        if (data.sourceStats) setSourceStats(data.sourceStats);
      }
    } catch { /* 深度补充失败不阻断 */ }
    finally { setIsSupplementing(false); }
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) { alert('请输入搜索关键词！'); return; }
    performSearch(searchQuery.trim());
  };

  const sanitizeTitle = (title: string) => title.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 80) || 'model';
  const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

  // 获取单个模型的可下载直链（resolve 模式会先请求解析接口）
  const getDownloadableUrl = async (result: SearchResult): Promise<{ url: string; filename: string }> => {
    if (result.isLocal) {
      return { url: result.downloadUrl || result.url, filename: `${sanitizeTitle(result.title)}.stl` };
    }
    if (result.downloadMode === 'resolve') {
      const resolved = await resolveDownload(result.sourceDetailUrl || result.url, result.siteId, result.title);
      if (!resolved.success || !resolved.downloadUrl) {
        throw new Error(resolved.error || '解析下载链接失败');
      }
      return { url: resolved.downloadUrl, filename: resolved.filename || `${sanitizeTitle(result.title)}.stl` };
    }
    const url = result.downloadUrl || result.url;
    const isZip = /\/zip|\.zip($|\?)/i.test(url) || /\/download($|\?)/i.test(url);
    return { url, filename: `${sanitizeTitle(result.title)}${isZip ? '.zip' : '.stl'}` };
  };

  // 主下载入口：支持 direct / resolve / local
  const downloadModel = async (result: SearchResult) => {
    const key = result.downloadUrl || result.url;
    setDownloadingUrls(prev => new Set(prev).add(key));
    try {
      const { url, filename } = await getDownloadableUrl(result);
      if (result.isLocal) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert('本地模型下载成功！');
        return;
      }
      const { blob, filename: realName } = await fetchViaProxy(url);
      triggerDownload(blob, realName || filename);
      alert('模型下载成功！请查看浏览器下载文件夹');
    } catch (error: unknown) {
      console.error('Download failed:', error);
      alert(errMsg(error, '下载失败，可稍后重试或换一个模型'));
    } finally {
      setDownloadingUrls(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  // 保存到模型库
  const handleSaveToLibrary = async (result: SearchResult) => {
    const key = result.downloadUrl || result.url;
    setDownloadingUrls(prev => new Set(prev).add(`save:${key}`));
    try {
      const { url, filename } = await getDownloadableUrl(result);
      await saveToLibrary(url, result.title, filename, getOwnerToken());
      alert(`已保存到「我的模型库」：${filename}`);
      await loadStoredModels();
    } catch (error: unknown) {
      console.error('Save to library failed:', error);
      alert(errMsg(error, '保存到模型库失败'));
    } finally {
      setDownloadingUrls(prev => { const n = new Set(prev); n.delete(`save:${key}`); return n; });
    }
  };

  // 批量下载：先解析直链，再逐一下载打包 zip
  const handleBatchDownload = async () => {
    const selected = searchResults.filter(r => selectedIds.has(r.id) && (r.canDirectDownload || r.downloadMode === 'resolve' || r.isLocal));
    if (selected.length === 0) { alert('请先勾选要下载的模型（需为可直下或可解析的模型）'); return; }

    setIsBatching(true);
    try {
      // 逐个解析直链
      const items: Array<{ url: string; filename: string }> = [];
      for (const result of selected) {
        try {
          const { url, filename } = await getDownloadableUrl(result);
          items.push({ url, filename });
        } catch (e: unknown) {
          console.warn(`解析失败: ${result.title}`, e);
        }
      }
      if (items.length === 0) throw new Error('所有选中模型均无法解析下载链接');

      const zipBlob = await batchDownloadAsZip(items, (current, total) => {
        setBatchProgress({ current, total });
      });
      const zipName = `${sanitizeTitle(searchKeyword || 'batch')}_${selected.length}个模型.zip`;
      triggerDownload(zipBlob, zipName);
      alert(`批量下载完成：${items.length}/${selected.length} 个模型已打包为 ${zipName}`);
      setSelectedIds(new Set());
    } catch (error: unknown) {
      console.error('Batch download failed:', error);
      alert(errMsg(error, '批量下载失败'));
    } finally {
      setIsBatching(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const inferMode = (result: SearchResult): SearchResult['downloadMode'] => result.downloadMode || (
    result.isTip ? undefined :
    result.isRecommendedSite && !result.downloadUrl ? 'external_search' :
    (result.downloadUrl || result.url).match(/\.(stl|zip|obj|3mf)$/i) ? 'direct' :
    'detail'
  );

  const getResultActionUrl = (result: SearchResult, mode: string | undefined): string => {
    if (mode === 'direct') return result.downloadUrl || result.url;
    if (result.isRealDetailPage && result.sourceDetailUrl) return result.sourceDetailUrl;
    return result.sourceSearchUrl || result.downloadUrl || result.url;
  };

  const handlePrimary = (result: SearchResult, mode: string | undefined) => {
    if (mode === 'direct' || mode === 'resolve') {
      downloadModel(result);
    } else {
      window.open(getResultActionUrl(result, mode), '_blank');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.stl')) { alert('请上传 STL 格式文件！'); return; }
    const formData = new FormData();
    formData.append('file', file);
    if (uploadCategory) formData.append('category', uploadCategory);
    try {
      const res = await fetch('/api/upload-stl', {
        method: 'POST',
        headers: { 'x-owner-token': getOwnerToken() },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        await loadStoredModels();
        notify(data.status === 'pending' ? '文件已上传，等待管理员审核' : '文件上传成功', 'success');
      } else {
        notify('上传失败：' + (data.error || '未知错误'), 'error');
      }
    } catch { notify('上传失败，请重试', 'error'); }
    event.target.value = '';
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`确定删除 ${key}？`)) return;
    const adminKey = getAdminKey(true);
    if (!adminKey) return;
    try {
      const model = storedModels.find(m => m.key === key);
      if (model?.url) {
        await fetch('/api/delete-stl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ url: model.url, key: model.key }),
        });
      }
      setStoredModels(prev => prev.filter(m => m.key !== key));
    } catch (error) {
      console.error('Delete failed:', error);
      alert('删除失败，请重试');
    }
  };

  const handleRename = (oldKey: string, newFilename: string) => {
    console.log(`[Page] Model renamed: ${oldKey} → ${newFilename}`);
    // 刷新列表
    loadStoredModels();
  };

  // 批量规则分类 + 规范化重命名
  const handleBatchClassify = async () => {
    if (storedModels.length === 0) {
      alert('图书馆中没有模型可以分类');
      return;
    }
    
    const confirmed = confirm(
      `将对 ${storedModels.length} 个模型进行规则分类并规范化重命名。\n\n` +
      `流程：\n` +
      `1. 根据文件名关键词自动分类\n` +
      `2. 重命名为「分类_名称_编号.stl」\n\n` +
      `确定继续吗？`
    );
    
    if (!confirmed) return;
    const adminKey = getAdminKey(true);
    if (!adminKey) return;
    
    setIsBatchClassifying(true);
    setClassifyProgress({ current: 0, total: storedModels.length, currentFile: '' });
    
    const results: Record<string, string> = {};
    const renamedFiles: { oldKey: string; newKey: string; category: string; success: boolean }[] = [];
    
    // 统计每个分类的数量（用于编号）
    const categoryCount: Record<string, number> = {};
    
    for (let i = 0; i < storedModels.length; i++) {
      const model = storedModels[i];
      setClassifyProgress({ 
        current: i + 1, 
        total: storedModels.length,
        currentFile: model.filename
      });
      
      try {
        const category = classifyByRules(model.filename);
        const displayName = generateDisplayName(model.filename);
        categoryCount[category] = (categoryCount[category] || 0) + 1;
        const index = categoryCount[category];
        const newFilename = generateCategoryFilename(category, displayName, index);

        results[model.key] = category;

        const response = await fetch('/api/rename-stl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey, 'x-owner-token': getOwnerToken() },
          body: JSON.stringify({ oldKey: model.key, oldUrl: model.url, category, displayName }),
        });
        
        const data = await response.json();
        renamedFiles.push({
          oldKey: model.key,
          newKey: data.success ? newFilename : model.filename,
          category,
          success: data.success,
        });
      } catch (error) {
        console.error(`[Batch Classify] 分类失败 for ${model.filename}:`, error);
        renamedFiles.push({ oldKey: model.key, newKey: model.filename, category: '失败', success: false });
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    setIsBatchClassifying(false);
    await loadStoredModels();
    
    const successCount = renamedFiles.filter(r => r.success).length;
    const catSummary = Object.entries(categoryCount).map(([cat, n]) => `${cat}: ${n}`).join('\n');
    alert(
      `分类完成！\n\n` +
      `成功: ${successCount}/${storedModels.length}\n\n` +
      `分类统计：\n${catSummary}`
    );
  };

  const renderGridCard = (result: SearchResult) => {
    const isDownloading = downloadingUrls.has(result.downloadUrl || result.url);
    const isSaving = downloadingUrls.has(`save:${result.downloadUrl || result.url}`);
    const mode = inferMode(result);
    const isDirect = mode === 'direct' || mode === 'resolve';
    const isSelected = selectedIds.has(result.id);
    const canBatch = result.canDirectDownload || result.downloadMode === 'resolve' || result.isLocal;
    const gradient = SITE_GRADIENTS[(result.siteId || '').toLowerCase()] || (result.siteName === '我的图书馆' ? SITE_GRADIENTS.library : SITE_GRADIENTS.default);

    if (result.isTip) {
      return (
        <div key={result.id} className="col-span-full">
          <Card className="border-none bg-transparent shadow-none py-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold text-gray-800">{result.title}</CardTitle>
              <CardDescription className="text-base text-gray-600 mt-1">{result.snippet}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }

    const modeBadge = MODE_BADGE_MAP[mode || ''];

    return (
      <Card
        key={result.id}
        className="animate-in fade-in slide-in-from-bottom-2 duration-300 hover:-translate-y-0.5 hover:shadow-md transition-all overflow-hidden cursor-pointer"
        onClick={() => setDetailResult(result)}
      >
        <div className={`relative w-full aspect-[4/3] ${gradient} overflow-hidden`}>
          {result.thumbnail ? (
            <img
              src={result.thumbnail}
              alt={result.title}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
                const fallback = img.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
          ) : null}
          <div className={`w-full h-full flex items-center justify-center ${result.thumbnail ? 'hidden' : ''}`}>
            <Image className="w-9 h-9 text-white/80" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur max-w-[70%]">
            {result.siteName === '我的图书馆' ? <FileArchive className="w-3 h-3 shrink-0" /> : <Globe className="w-3 h-3 shrink-0" />}
            <span className="truncate">{result.siteName}</span>
          </span>
          {canBatch && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleSelect(result.id); }}
              title={isSelected ? '取消批量勾选' : '加入批量下载'}
              className={`absolute right-2 top-2 flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-black/50 text-white border-transparent hover:bg-black/70'}`}
            >
              {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            </button>
          )}
          {modeBadge && <div className="absolute left-2 bottom-2">{modeBadge}</div>}
          {result.verifiedFree !== undefined && (
            <div className="absolute right-2 bottom-2">
              <Badge className={result.verifiedFree ? 'bg-green-500/90 text-xs text-white' : 'bg-orange-500/90 text-xs text-white'}>
                {result.verifiedFree ? '✓ 免费' : '⚠ 付费'}
              </Badge>
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="text-sm font-medium leading-snug line-clamp-2 min-h-10">{result.title}</h3>
          <div className="flex items-center gap-1.5 mt-2">
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); handlePrimary(result, mode); }}
              disabled={isDownloading && isDirect}
              className={`flex-1 h-8 text-xs font-medium ${btnStyleFor(mode || '')}`}
            >
              {btnIconFor(mode, isDownloading)}
              {btnLabelFor(mode, isDownloading)}
            </Button>
            {isDirect && !result.isLocal && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-9 shrink-0 px-0"
                title="保存到我的模型库"
                disabled={isSaving}
                onClick={(e) => { e.stopPropagation(); handleSaveToLibrary(result); }}
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderDetailDialog = () => {
    const result = detailResult;
    if (!result) return null;
    const isDownloading = downloadingUrls.has(result.downloadUrl || result.url);
    const isSaving = downloadingUrls.has(`save:${result.downloadUrl || result.url}`);
    const mode = inferMode(result);
    const isDirect = mode === 'direct' || mode === 'resolve';
    const gradient = SITE_GRADIENTS[(result.siteId || '').toLowerCase()] || (result.siteName === '我的图书馆' ? SITE_GRADIENTS.library : SITE_GRADIENTS.default);

    return (
      <Dialog open onOpenChange={(open) => { if (!open) setDetailResult(null); }}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <div className={`relative w-full h-48 ${gradient} rounded-lg overflow-hidden`}>
            {result.thumbnail ? (
              <img src={result.thumbnail} alt={result.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image className="w-10 h-10 text-white/80" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-base leading-snug">{result.title}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                {result.siteName === '我的图书馆' ? <FileArchive className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                {result.siteName}
              </span>
              {MODE_BADGE_MAP[mode || '']}
              {result.verifiedFree !== undefined && (
                <Badge className={result.verifiedFree ? 'bg-green-500 text-xs text-white' : 'bg-orange-500 text-xs text-white'}>
                  {result.verifiedFree ? '✓ 免费' : '⚠ 付费'}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          {result.snippet && <p className="text-sm text-muted-foreground">{result.snippet}</p>}
          {result.downloadHint && (
            <p className={`text-xs ${isDirect ? 'text-green-600' : 'text-muted-foreground'}`}>{result.downloadHint}</p>
          )}

          {isDirect ? (
            <div className="flex flex-col gap-2">
              <Button onClick={() => handlePrimary(result, mode)} disabled={isDownloading} className={`w-full ${btnStyleFor(mode || '')}`}>
                {btnIconFor(mode, isDownloading)}
                {btnLabelFor(mode, isDownloading)}
              </Button>
              {!result.isLocal && (
                <Button variant="outline" onClick={() => handleSaveToLibrary(result)} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  保存到我的模型库
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground space-y-0.5 rounded-lg bg-muted p-3">
                <p>① 点击下方按钮进入原站</p>
                <p>② 在原站登录或筛选并下载 STL</p>
                <p>③ 回到本系统，点击下方按钮导入</p>
              </div>
              <Button onClick={() => window.open(getResultActionUrl(result, mode), '_blank')} className={btnStyleFor(mode || '')}>
                <ExternalLink className="w-4 h-4 mr-2" />
                打开原站页面
              </Button>
              <Button variant="outline" onClick={() => { setDetailResult(null); document.getElementById('post-download-upload')?.click(); }}>
                <Upload className="w-4 h-4 mr-2" />
                我已下载，导入本地 STL
              </Button>
            </div>
          )}

          {process.env.NODE_ENV === 'development' && (
            <p className="text-[10px] text-gray-300 leading-tight">
              mode={mode ?? 'undefined'} | realDetail={result.isRealDetailPage === true ? 'true' : 'false'}
            </p>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-8 pb-28">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold mb-2">🏛️ STL Model Crawler & Viewer</h1>
          <p className="text-muted-foreground">
            中国古代建筑3D模型 · 多站点深度爬虫 · <span className="text-green-600 font-medium">直接下载 STL</span> · <span className="text-purple-600 font-medium">智能分类</span>
          </p>
        </div>

        <Tabs defaultValue="search" className="space-y-6">
          <TabsList className="overflow-x-auto w-full sm:w-auto justify-start sm:justify-center">
            <TabsTrigger value="search" className="whitespace-nowrap">🔍 搜索下载</TabsTrigger>
            <TabsTrigger value="library" className="whitespace-nowrap">
              📁 我的图书馆
              {storedModels.length > 0 && <Badge variant="secondary" className="ml-2">{storedModels.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="settings" className="whitespace-nowrap">⚙️ 站点设置</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>搜索 STL 古建筑模型</CardTitle>
                <CardDescription>输入关键词，精确匹配精选模型库 + 多站点真实可下载 STL</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input placeholder="输入古建筑关键词（如：六角亭 / 廊桥 / 四合院 / 牌坊 / 龙）" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="flex-1 text-base" />
                  <Button onClick={handleSearch} disabled={isSearching} size="lg">
                    {isSearching ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Search className="w-5 h-5 mr-2" />}
                    {isSearching ? '搜索中…' : '搜索'}
                  </Button>
                </div>
                {searchHistory.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    <span className="text-xs text-gray-400 mr-1">搜索历史：</span>
                    {searchHistory.map(h => (
                      <button key={h} onClick={() => performSearch(h)} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 hover:bg-purple-100 hover:text-purple-700 text-gray-600 transition-colors">
                        {h}
                      </button>
                    ))}
                    <button onClick={clearSearchHistory} className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 transition-colors">清除</button>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">支持：亭子 · 塔 · 桥 · 牌坊 · 殿 · 庙 · 祠堂 · 四合院 · 园林 · 戏台 · 民居 · 龙</p>
              </CardContent>
            </Card>

            <Card className="border-dashed border-2 bg-gradient-to-br from-emerald-50/70 to-cyan-50/50">
              <CardHeader>
                <CardTitle className="text-base">上传 STL 文件</CardTitle>
                <CardDescription>选择分类后上传，模型会自动进入「我的图书馆」并规范化命名</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="h-10 rounded-md border border-input bg-transparent px-3 text-sm sm:w-36"
                  >
                    <option value="">自动分类</option>
                    {CATEGORIES.filter(c => c.id !== '其他').map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                    ))}
                  </select>
                  <Input type="file" accept=".stl" onChange={handleFileUpload} className="flex-1" />
                  <Button asChild><label className="cursor-pointer"><Upload className="w-4 h-4 mr-2" />上传</label></Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">未选择分类时，将根据文件名自动归类；支持后续在图书馆一键整理。</p>
              </CardContent>
            </Card>
            <input type="file" id="post-download-upload" accept=".stl" onChange={handleFileUpload} className="hidden" />

            <div className="space-y-3">
              {isSearching ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="rounded-lg border overflow-hidden">
                        <div className="aspect-video bg-gray-100 animate-pulse" />
                        <div className="p-3 space-y-2">
                          <div className="h-3 w-3/4 bg-gray-100 animate-pulse rounded" />
                          <div className="h-3 w-1/2 bg-gray-100 animate-pulse rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground animate-pulse">正在搜索多站点资源…</p>
                </>
              ) : (
                <>
                  {isSupplementing && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      正在补充站点结果…
                      {Object.keys(sourceStats).length > 0 && (
                        <span className="text-xs text-gray-400">
                          {Object.entries(sourceStats)
                            .filter(([, v]) => v > 0)
                            .map(([k, v]) => {
                              const nameMap: Record<string, string> = { aigei: '爱给网', yeggi: 'Yeggi', '3d66': '3D溜溜', thingiverse: 'Thingiverse', printables: 'Printables' };
                              return `${nameMap[k] || k} ${v}`;
                            })
                            .join(' / ')}
                        </span>
                      )}
                    </div>
                  )}
                  {!hasSearchResult && emptyTip && (
                    <Card className="border-orange-200 bg-orange-50">
                      <CardContent className="py-3 px-4"><p className="text-orange-700 text-sm font-medium">{emptyTip}</p></CardContent>
                    </Card>
                  )}
                  {searchResults.length > 0 && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span>共找到 <span className="font-semibold text-foreground">{searchStats.total}</span> 个结果</span>
                        <span className="text-green-600">免费 {searchStats.free}</span>
                        <span className="text-emerald-600">可下载 {searchStats.downloadable}</span>
                        {searchStats.paid > 0 && <span className="text-amber-600">付费 {searchStats.paid}</span>}
                        {selectedIds.size > 0 && <span className="text-primary font-medium">已选 {selectedIds.size} 个</span>}
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <Filter className="w-4 h-4 text-gray-400 shrink-0" />
                        {([
                          ['all', '全部'], ['free', '免费'], ['download', '可下载'], ['login', '需登录'], ['paid', '付费'],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            onClick={() => setResultFilter(value)}
                            className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-all ${resultFilter === value ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {visibleSearchResults.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {visibleSearchResults.map(renderGridCard)}
                    </div>
                  ) : searchResults.length > 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="py-10 text-center">
                        <Filter className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                        <p className="text-muted-foreground">当前筛选条件下没有结果</p>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => setResultFilter('all')}>显示全部结果</Button>
                      </CardContent>
                    </Card>
                  ) : !hasSearchResult ? null : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Image className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <p className="text-muted-foreground text-lg mb-1">暂无搜索结果</p>
                        <p className="text-sm text-gray-400 mb-4">试试换个关键词，或调整以下常用词：</p>
                        <div className="flex flex-wrap justify-center gap-2 mb-4">
                          {['亭子', '塔', '桥', '牌坊', '四合院', '园林'].map(s => (
                            <button key={s} onClick={() => performSearch(s)} className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors">{s}</button>
                          ))}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => document.querySelector<HTMLElement>('[data-value="settings"]')?.click()}>
                          <Settings className="w-4 h-4 mr-2" />检查站点设置
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
                <div className="flex items-center gap-2 bg-foreground/90 backdrop-blur text-background rounded-full shadow-xl px-4 py-2.5">
                  <span className="text-sm font-medium whitespace-nowrap">已选 {selectedIds.size} 个</span>
                  <div className="flex-1" />
                  <Button size="sm" onClick={handleBatchDownload} disabled={isBatching} className="bg-purple-600 hover:bg-purple-700 text-white rounded-full">
                    {isBatching ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Package className="w-4 h-4 mr-1" />}
                    {isBatching ? `打包中 ${batchProgress.current}/${batchProgress.total}` : '打包下载'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={isBatching} className="text-background hover:bg-foreground/20 rounded-full">
                    清空
                  </Button>
                </div>
              </div>
            )}

            {detailResult && renderDetailDialog()}
          </TabsContent>

          <TabsContent value="library" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>📁 我的 STL 图书馆</CardTitle>
                    <CardDescription>管理已下载的本地古建筑STL模型，支持规则分类和规范化重命名</CardDescription>
                  </div>
                  <div className="flex gap-2 items-center">
                    {/* 视图切换 */}
                    <div className="flex border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`px-3 py-1.5 text-sm ${viewMode === 'grid' ? 'bg-purple-100 text-purple-700' : 'bg-white text-gray-600'}`}
                      >
                        📋 列表
                      </button>
                      <button
                        onClick={() => setViewMode('category')}
                        className={`px-3 py-1.5 text-sm ${viewMode === 'category' ? 'bg-purple-100 text-purple-700' : 'bg-white text-gray-600'}`}
                      >
                        📂 分类
                      </button>
                    </div>
                    {/* 批量分类按钮 */}
                    <Button onClick={handleBatchClassify} variant="outline" size="sm" disabled={isBatchClassifying || storedModels.length === 0} className="bg-purple-600 text-white hover:bg-purple-700 border-purple-600">
                      {isBatchClassifying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {classifyProgress.current}/{classifyProgress.total}
                        </>
                      ) : (
                        <>
                          <FolderSync className="w-4 h-4 mr-2" />
                          一键分类收纳
                        </>
                      )}
                    </Button>
                    <Button onClick={loadStoredModels} variant="outline" size="sm">
                      <RefreshCw className="w-4 h-4 mr-2" />刷新
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 pb-4">
                {[
                  ['全部模型', libraryStats.total, 'text-emerald-700'],
                  ['已分类', libraryStats.classified, 'text-blue-700'],
                  ['未分类', libraryStats.unclassified, 'text-amber-700'],
                  ['分类数', libraryStats.categories.length, 'text-purple-700'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="rounded-xl border bg-white/70 px-3 py-2 transition-all hover:-translate-y-0.5 hover:shadow-sm">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className={`text-xl font-semibold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <CardContent>
                {storedModels.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="搜索文件名…"
                        value={libraryQuery}
                        onChange={(e) => setLibraryQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <select
                      value={libraryCategory}
                      onChange={(e) => setLibraryCategory(e.target.value)}
                      className="h-10 w-full sm:w-44 rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="全部">全部</option>
                      {libraryStats.categories.map(([c]) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="未分类">未分类</option>
                    </select>
                  </div>
                )}
                {storedModels.length > 0 && libraryStats.categories.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-3">
                    <span className="text-xs text-muted-foreground shrink-0">快速分类</span>
                    <button
                      onClick={() => setLibraryCategory('全部')}
                      className={`rounded-full px-3 py-1 text-xs whitespace-nowrap transition-colors ${libraryCategory === '全部' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-emerald-50'}`}
                    >全部 {libraryStats.total}</button>
                    {libraryStats.categories.map(([category, models]) => (
                      <button
                        key={category}
                        onClick={() => setLibraryCategory(category)}
                        className={`rounded-full px-3 py-1 text-xs whitespace-nowrap transition-colors ${libraryCategory === category ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500 hover:bg-purple-50'}`}
                      >{category} {models.length}</button>
                    ))}
                    {libraryStats.unclassified > 0 && (
                      <button
                        onClick={() => setLibraryCategory('未分类')}
                        className={`rounded-full px-3 py-1 text-xs whitespace-nowrap transition-colors ${libraryCategory === '未分类' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-amber-50'}`}
                      >未分类 {libraryStats.unclassified}</button>
                    )}
                  </div>
                )}
                {/* 分类进度提示 */}
                {isBatchClassifying && (
                  <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                      <div>
                        <p className="font-medium text-purple-800">正在批量分类...</p>
                        <p className="text-sm text-purple-600">
                          进度: {classifyProgress.current}/{classifyProgress.total}
                          {classifyProgress.currentFile && ` - ${classifyProgress.currentFile}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {isLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : filteredModels.length === 0 && storedModels.length > 0 ? (
                  <div className="text-center py-12">
                    <Search className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-lg mb-2 text-muted-foreground">没有匹配的模型</p>
                    <p className="text-sm text-gray-400 mb-4">换个关键词，或清空筛选条件</p>
                    <Button variant="outline" size="sm" onClick={() => { setLibraryQuery(''); setLibraryCategory('全部'); }}>
                      <RefreshCw className="w-4 h-4 mr-2" />清空筛选
                    </Button>
                  </div>
                ) : storedModels.length === 0 ? (
                  <div className="text-center py-12">
                    <FileArchive className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-lg mb-2 text-muted-foreground">图书馆为空</p>
                    <p className="text-sm text-gray-400 mb-4">从「搜索下载」页下载STL模型，或直接上传本地文件</p>
                    <Button variant="outline" size="sm" onClick={() => document.querySelector<HTMLElement>('[data-value="search"]')?.click()}>
                      <Search className="w-4 h-4 mr-2" />去搜索
                    </Button>
                  </div>
                ) : viewMode === 'grid' ? (
                  /* 列表视图 */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {viewModels.map(model => (
                      <STLModelCard 
                        key={model.key} 
                        model={model} 
                        onDelete={handleDelete}
                        onRename={handleRename}
                      />
                    ))}
                  </div>
                ) : (
                  /* 分类视图 */
                  <div className="space-y-6">
                    {Object.entries(categorizedModels.categories).map(([category, models]) => (
                      <div key={category} className="border rounded-lg overflow-hidden">
                        <div className="bg-purple-50 px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-purple-600" />
                            <span className="font-medium text-purple-800">{category}</span>
                            <Badge variant="secondary" className="ml-2">{models.length}</Badge>
                          </div>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {models.map(model => (
                            <STLModelCard 
                              key={model.key} 
                              model={model} 
                              onDelete={handleDelete}
                              onRename={handleRename}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {categorizedModels.uncategorized.length > 0 && (
                      <div className="border rounded-lg overflow-hidden border-dashed">
                        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileArchive className="w-5 h-5 text-gray-500" />
                            <span className="font-medium text-gray-700">未分类</span>
                            <Badge variant="secondary" className="ml-2">{categorizedModels.uncategorized.length}</Badge>
                          </div>
                          <span className="text-xs text-gray-400">点击「一键分类收纳」自动归类</span>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {categorizedModels.uncategorized.map(model => (
                            <STLModelCard 
                              key={model.key} 
                              model={model} 
                              onDelete={handleDelete}
                              onRename={handleRename}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <SiteSettings />
          </TabsContent>
        </Tabs>

        <div className="mt-12 pt-6 border-t text-center text-xs text-gray-400">
          <p>STL Model Crawler · 中国古代建筑博物馆可视化系统 · 大数据实践赛作品</p>
          <p className="mt-1">Thingiverse · Printables · 爱给网 · 3D溜溜网 · Yeggi · Sketchfab</p>
        </div>
      </div>
      {toast && (
        <div className="fixed right-4 top-4 z-[100] animate-in slide-in-from-right-4 fade-in duration-300">
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${toast.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : toast.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {toast.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100" aria-label="关闭提示"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
