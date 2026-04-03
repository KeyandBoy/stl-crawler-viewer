'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { STLModelCard } from '@/components/STLModelCard';
import {
  Search, Download, Loader2, ExternalLink, Upload, RefreshCw,
  Globe, FileArchive, Image, ArrowRight, Sparkles, FolderOpen,
  CheckCircle2, FolderSync
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
  const [isBatchClassifying, setIsBatchClassifying] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [autoRename, setAutoRename] = useState(true); // 默认开启自动重命名
  const [viewMode, setViewMode] = useState<'grid' | 'category'>('grid'); // 视图模式
  const [classifyResults, setClassifyResults] = useState<Record<string, string>>({}); // 存储分类结果

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

  // 按分类分组模型 - 从 classifyResults 获取分类信息
  const categorizedModels = useMemo(() => {
    const categories: Record<string, StoredModel[]> = {};
    const uncategorized: StoredModel[] = [];
    
    for (const model of storedModels) {
      // 优先使用 classifyResults 中的分类信息（来自服务器）
      const category = classifyResults[model.key];
      
      if (category) {
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(model);
      } else {
        // 备用：检查文件名是否包含分类前缀
        const name = model.filename;
        const match = name.match(/^([^/_]+)[/_]/);
        
        if (match) {
          const categoryName = match[1];
          if (!categories[categoryName]) {
            categories[categoryName] = [];
          }
          categories[categoryName].push(model);
        } else {
          uncategorized.push(model);
        }
      }
    }
    
    return { categories, uncategorized };
  }, [storedModels, classifyResults]);

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

  const handleDownload = async (url: string, title: string, isLocal = false, downloadUrl?: string) => {
    if (!url || url === '') return;
    const finalUrl = downloadUrl || url;
    
    if (finalUrl.includes('thingiverse.com') && finalUrl.includes('/zip')) {
      window.open(finalUrl, '_blank');
      return;
    }
    if (finalUrl.includes('printables.com') && finalUrl.includes('/files')) {
      window.open(finalUrl, '_blank');
      return;
    }
    if (finalUrl.includes('aigei.com') || finalUrl.includes('3d66.com') || finalUrl.includes('sketchfab.com')) {
      window.open(finalUrl, '_blank');
      return;
    }
    if (finalUrl.includes('yeggi.com')) {
      window.open(finalUrl, '_blank');
      return;
    }
    
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
      window.open(finalUrl, '_blank');
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

  const handleDelete = async (key: string) => {
    if (!confirm(`确定删除 ${key}？`)) return;
    try {
      const model = storedModels.find(m => m.key === key);
      if (model?.url) {
        await fetch('/api/download-stl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: model.url }),
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

  // 批量 AI 分类 + 自动重命名
  const handleBatchClassify = async () => {
    if (storedModels.length === 0) {
      alert('图书馆中没有模型可以分类');
      return;
    }
    
    const confirmed = confirm(
      `将对 ${storedModels.length} 个模型进行 AI 分类并自动重命名。\n\n` +
      `流程：\n` +
      `1. AI 识别模型类型\n` +
      `2. 自动重命名为「分类_原文件名.stl」\n\n` +
      `这可能需要几分钟，确定继续吗？`
    );
    
    if (!confirmed) return;
    
    setIsBatchClassifying(true);
    setClassifyProgress({ current: 0, total: storedModels.length, currentFile: '' });
    
    const results: Record<string, string> = {}; // 存储分类结果
    const renamedFiles: { oldKey: string; newKey: string; category: string; success: boolean }[] = [];
    
    // 动态导入分类函数
    const { classifySTLModel } = await import('@/components/STLClassifier');
    
    for (let i = 0; i < storedModels.length; i++) {
      const model = storedModels[i];
      setClassifyProgress({ 
        current: i + 1, 
        total: storedModels.length,
        currentFile: model.filename
      });
      
      try {
        // 判断 URL 类型
        const isPrivateBlob = model.url.includes('blob.vercel-storage.com');
        const fetchUrl = isPrivateBlob ? `/api/get-blob?url=${encodeURIComponent(model.url)}` : model.url;
        
        // AI 分类
        const predictions = await classifySTLModel(fetchUrl);
        
        if (predictions.length > 0) {
          const category = predictions[0].className.replace(/[/\s]/g, '_');
          const originalName = model.filename.replace('.stl', '').replace('.STL', '');
          // 不使用子文件夹，直接用分类前缀重命名
          const newFilename = `${category}_${originalName}.stl`;
          
          console.log(`[Batch Classify] ${model.filename} → ${newFilename} (category: ${category})`);
          
          // 存储分类结果
          results[model.key] = category;
          
          // 执行重命名
          const response = await fetch('/api/rename-stl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              oldKey: model.key,
              oldUrl: model.url,
              newFilename,
            }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            renamedFiles.push({ 
              oldKey: model.key, 
              newKey: newFilename, 
              category, 
              success: true 
            });
            console.log(`[Batch Classify] ✅ 重命名成功: ${model.filename} → ${newFilename}`);
          } else {
            renamedFiles.push({ oldKey: model.key, newKey: model.filename, category, success: false });
            console.error(`[Batch Classify] ❌ 重命名失败: ${model.filename}`, data.error);
          }
        }
      } catch (error) {
        console.error(`[Batch Classify] 分类失败 for ${model.filename}:`, error);
        renamedFiles.push({ oldKey: model.key, newKey: model.filename, category: '失败', success: false });
      }
      
      // 短暂延迟
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // 更新分类结果状态
    setClassifyResults(results);
    setIsBatchClassifying(false);
    
    // 刷新列表
    await loadStoredModels();
    
    // 显示结果
    const successCount = renamedFiles.filter(r => r.success).length;
    const summary = renamedFiles
      .map(r => `${r.success ? '✅' : '❌'} ${r.oldKey} → ${r.newKey}`)
      .join('\n');
    
    alert(
      `✅ 批量分类完成！\n\n` +
      `成功: ${successCount}/${storedModels.length}\n\n` +
      `详情：\n${summary}`
    );
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
            <img src={result.thumbnail} alt={result.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base leading-snug line-clamp-2">{result.title}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1 text-xs">
                <span className="flex items-center gap-1">
                  {result.siteName === '我的图书馆' ? <FileArchive className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-3">
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{result.snippet}</p>
          <div className="flex flex-col gap-2">
            {hasDownload && !result.isRecommendedSite && (
              <Button size="sm" onClick={() => handleDownload(result.url, result.title, result.isLocal, result.downloadUrl)} disabled={isDownloading} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium">
                {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {isDownloading ? '处理中…' : '⬇ 下载模型'}
              </Button>
            )}
            {hasJump && (
              <Button size="sm" variant="outline" onClick={() => handleJump(result.url)} className="w-full border-blue-500 text-blue-600 hover:bg-blue-50">
                <ExternalLink className="w-4 h-4 mr-2" />
                跳转查看详情
              </Button>
            )}
          </div>
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
            中国古代建筑3D模型 · 多站点深度爬虫 · <span className="text-green-600 font-medium">直接下载 STL</span> · <span className="text-purple-600 font-medium">AI 智能分类</span>
          </p>
        </div>

        <Tabs defaultValue="search" className="space-y-6">
          <TabsList>
            <TabsTrigger value="search">🔍 搜索下载</TabsTrigger>
            <TabsTrigger value="library">
              📁 我的图书馆
              {storedModels.length > 0 && <Badge variant="secondary" className="ml-2">{storedModels.length}</Badge>}
            </TabsTrigger>
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
                <p className="text-xs text-gray-400 mt-2">支持：亭子 · 塔 · 桥 · 牌坊 · 殿 · 庙 · 祠堂 · 四合院 · 园林 · 戏台 · 民居 · 龙</p>
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
                  <Button asChild><label className="cursor-pointer"><Upload className="w-4 h-4 mr-2" />上传</label></Button>
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
                      <p className="text-sm text-muted-foreground mt-1">Thingiverse · Printables · 爱给网 · 3D溜溜网 · Yeggi · Sketchfab</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {!hasSearchResult && emptyTip && (
                    <Card className="border-orange-200 bg-orange-50">
                      <CardContent className="py-3 px-4"><p className="text-orange-700 text-sm font-medium">{emptyTip}</p></CardContent>
                    </Card>
                  )}
                  {searchResults.length > 0 && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">共找到 <span className="font-semibold text-foreground">{searchResults.length}</span> 个结果</p>
                    </div>
                  )}
                  {searchResults.length > 0 ? (
                    <div className="flex flex-col gap-3">{searchResults.map(renderCard)}</div>
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
                    <CardDescription>管理已下载的本地古建筑STL模型，支持 AI 智能分类</CardDescription>
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
              <CardContent>
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
                    {storedModels.map(model => (
                      <STLModelCard 
                        key={model.key} 
                        model={model} 
                        onDelete={handleDelete}
                        onRename={handleRename}
                        autoRename={autoRename}
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
        </Tabs>

        <div className="mt-12 pt-6 border-t text-center text-xs text-gray-400">
          <p>STL Model Crawler · 中国古代建筑博物馆可视化系统 · 大数据实践赛作品</p>
          <p className="mt-1">Thingiverse · Printables · 爱给网 · 3D溜溜网 · Yeggi · Sketchfab</p>
        </div>
      </div>
    </div>
  );
}
