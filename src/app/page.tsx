'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { STLModelCard } from '@/components/STLModelCard';
import {
  Search, Download, Loader2, ExternalLink, Upload, RefreshCw,
  Globe, FileArchive, Image, ArrowRight
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
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  hasResult?: boolean;
  emptyTip?: string;
  curatedCount?: number;
  crawledCount?: number;
}

interface StoredModel {
  key: string;
  url: string;
  filename: string;
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [storedModels, setStoredModels] = useState<StoredModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingUrls, setDownloadingUrls] = useState<Set<string>>(new Set());
  const [emptyTip, setEmptyTip] = useState('');
  const [hasSearchResult, setHasSearchResult] = useState(true);

  useEffect(() => { loadStoredModels(); }, []);

  const loadStoredModels = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/list-stl');
      const data = await res.json();
      if (data.success) setStoredModels(data.files);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { alert('请输入搜索关键词！'); return; }
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch('/api/search-stl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, count: 30 }),
      });
      const data = await res.json() as SearchResponse;
      if (data.success) {
        setSearchResults(data.results || []);
        setHasSearchResult(data.hasResult ?? true);
        setEmptyTip(data.emptyTip ?? '');
      }
    } catch {
      setHasSearchResult(false);
      setEmptyTip('搜索失败，请检查网络后重试');
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownload = async (
    url: string, title: string, isLocal = false, downloadUrl?: string
  ) => {
    if (!url || url === '') return;
    const finalUrl = downloadUrl || url;
    setDownloadingUrls(prev => new Set(prev).add(finalUrl));
    try {
      if (isLocal) {
        const link = document.createElement('a');
        link.href = finalUrl;
        link.download = title || 'local-model.stl';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert('本地模型下载成功！');
        await loadStoredModels();
        return;
      }
      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(finalUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: '未知错误' }));
        throw new Error(errData.error || `下载失败：${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${title.replace(/[^\w\s-]/gi, '_')}.stl`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(blobUrl); }, 100);
      alert('模型下载成功！请查看浏览器下载文件夹');
      await loadStoredModels();
    } catch (error) {
      console.error('Download failed:', error);
      alert(`下载失败：${(error as Error).message}\n\n可复制链接到浏览器下载：\n${finalUrl}`);
    } finally {
      setDownloadingUrls(prev => { const n = new Set(prev); n.delete(finalUrl); return n; });
    }
  };

  const handleJump = (url: string) => {
    if (url && url.trim() !== '') window.open(url, '_blank');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.stl')) { alert('请上传 STL 格式文件！'); return; }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload-stl', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { await loadStoredModels(); alert('文件上传成功！'); }
      else { alert('上传失败：' + (data.error || '未知错误')); }
    } catch { alert('上传失败，请重试。'); }
    event.target.value = '';
  };

  const handleDelete = (key: string) => {
    setStoredModels(prev => prev.filter(m => m.key !== key));
    alert('模型已从列表移除！');
  };

  const renderCard = (result: SearchResult) => {
    const isDownloading = downloadingUrls.has(result.downloadUrl || result.url);
    const hasDownload = !!(result.downloadUrl && result.downloadUrl.trim() !== '');
    const hasJump = !!(result.url && result.url.trim() !== '' && !result.isRecommendedSite);
    const isJumpOnly = !!(result.isRecommendedSite && result.url && result.url.trim() !== '');

    if (result.isTip) {
      return (
        <Card key={result.id} className="border-none bg-transparent shadow-none py-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold text-gray-800">{result.title}</CardTitle>
            <CardDescription className="text-base text-gray-600 mt-1">{result.snippet}</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    if (result.isRecommendedSite && !result.downloadUrl) {
      return (
        <Card key={result.id} className="border border-dashed border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50 transition-colors">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold text-gray-800 truncate">{result.title}</CardTitle>
                  <CardDescription className="text-xs text-gray-500 line-clamp-1 mt-0.5">{result.snippet}</CardDescription>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleJump(result.url)} className="border-blue-500 text-blue-600 hover:bg-blue-100 flex-shrink-0 ml-3">
                <ArrowRight className="w-3.5 h-3.5 mr-1" />
                跳转搜索
              </Button>
            </div>
          </CardHeader>
        </Card>
      );
    }

    return (
      <Card key={result.id} className="hover:shadow-md transition-shadow overflow-hidden">
        {result.thumbnail && (
          <div className="w-full h-32 bg-gray-100">
            <img
              src={result.thumbnail}
              alt={result.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base leading-snug line-clamp-2">{result.title}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1 text-xs">
                <span className="flex items-center gap-1">
                  {result.siteName === '我的图书馆'
                    ? <FileArchive className="w-3 h-3" />
                    : <Globe className="w-3 h-3" />}
                  {result.siteName}
                </span>
                {result.publishTime && <span>· {result.publishTime}</span>}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-1 items-end flex-shrink-0">
              {result.verifiedFree !== undefined && (
                <Badge className={result.verifiedFree ? 'bg-green-500 text-xs' : 'bg-orange-500 text-xs'}>
                  {result.verifiedFree ? '✓ 免费' : '⚠ 付费'}
                </Badge>
              )}
              {result.isLocal && (
                <Badge variant="secondary" className="text-xs">
                  <Image className="w-3 h-3 mr-1" />
                  本地
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-3">
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{result.snippet}</p>
          <div className="flex flex-col gap-2">
            {hasDownload && !result.isRecommendedSite && (
              <Button
                size="sm"
                onClick={() => handleDownload(result.url, result.title, result.isLocal, result.downloadUrl)}
                disabled={isDownloading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
              >
                {isDownloading
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Download className="w-4 h-4 mr-2" />}
                {isDownloading ? '下载中…' : '▼ 直接下载 STL'}
              </Button>
            )}
            {hasJump && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleJump(result.url)}
                className="w-full border-blue-500 text-blue-600 hover:bg-blue-50"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                跳转 {result.siteName} 查看详情
              </Button>
            )}
            {isJumpOnly && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleJump(result.url)}
                className="w-full border-gray-400 text-gray-600 hover:bg-gray-50"
              >
                <Globe className="w-4 h-4 mr-2" />
                跳转 {result.siteName} 搜索页
              </Button>
            )}
          </div>
          {result.url && result.url.startsWith('http') && (
            <p className="text-xs text-gray-400 mt-2 truncate">{result.url}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">🏛️ STL Model Crawler & Viewer</h1>
          <p className="text-muted-foreground">
            中国古代建筑3D模型 · 多站点深度爬虫 · <span className="text-green-600 font-medium">直接下载 STL</span>
          </p>
        </div>

        <Tabs defaultValue="search" className="space-y-6">
          <TabsList>
            <TabsTrigger value="search">🔍 搜索下载</TabsTrigger>
            <TabsTrigger value="library">
              📁 我的图书馆
              {storedModels.length > 0 && (
                <Badge variant="secondary" className="ml-2">{storedModels.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>搜索 STL 古建筑模型</CardTitle>
                <CardDescription>
                  输入关键词，精确匹配精选模型库 + 多站点真实可下载 STL
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="输入古建筑关键词（如：六角亭 / 廊桥 / 四合院 / 牌坊 / 龙）"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1 text-base"
                  />
                  <Button onClick={handleSearch} disabled={isSearching} size="lg">
                    {isSearching
                      ? <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      : <Search className="w-5 h-5 mr-2" />}
                    {isSearching ? '搜索中…' : '搜索'}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  支持：亭子 · 塔 · 桥 · 牌坊 · 殿 · 庙 · 祠堂 · 四合院 · 园林 · 戏台 · 民居 · 龙
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">上传 STL 文件</CardTitle>
                <CardDescription>将本地的 STL 模型上传到「我的图书馆」</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Input type="file" accept=".stl" onChange={handleFileUpload} className="flex-1" />
                  <Button asChild>
                    <label className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />上传
                    </label>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {isSearching ? (
                <Card>
                  <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <div className="text-center">
                      <p className="text-lg font-medium">正在搜索多站点资源…</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Thingiverse · Printables · 爱给网 · 3D溜溜网 · Yeggi · Sketchfab
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {!hasSearchResult && emptyTip && (
                    <Card className="border-orange-200 bg-orange-50">
                      <CardContent className="py-3 px-4">
                        <p className="text-orange-700 text-sm font-medium">{emptyTip}</p>
                      </CardContent>
                    </Card>
                  )}
                  {searchResults.length > 0 && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        共找到 <span className="font-semibold text-foreground">{searchResults.length}</span> 个结果
                      </p>
                      <div className="flex gap-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Download className="w-3 h-3 text-green-600" /> 直接下载STL
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-blue-600" /> 跳转站点
                        </span>
                      </div>
                    </div>
                  )}
                  {searchResults.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {searchResults.map(renderCard)}
                    </div>
                  ) : !hasSearchResult ? null : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Image className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <p className="text-muted-foreground text-lg mb-1">暂无搜索结果</p>
                        <p className="text-sm text-gray-400">输入关键词后点击「搜索」</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="library" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>📁 我的 STL 图书馆</CardTitle>
                    <CardDescription>管理已下载的本地古建筑STL模型</CardDescription>
                  </div>
                  <Button onClick={loadStoredModels} variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />刷新
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin" />
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
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {storedModels.map(model => (
                      <STLModelCard key={model.key} model={model} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-12 pt-6 border-t text-center text-xs text-gray-400">
          <p>STL Model Crawler · 中国古代建筑博物馆可视化系统 · 大数据实践赛作品</p>
          <p className="mt-1">Thingiverse · Printables · 爱给网 · 3D溜溜网 · Yeggi · Sketchfab</p>
        </div>
      </div>
    </div>
  );
}
