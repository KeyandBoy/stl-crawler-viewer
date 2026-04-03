'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { STLViewer } from './STLViewer';
import { STLClassifier } from './STLClassifier';
import { Download, Eye, Trash2, Tag, Loader2, FolderSync, CheckCircle2, Folder } from 'lucide-react';

interface ClassificationResult {
  className: string;
  probability: number;
}

interface STLModelCardProps {
  model: {
    key: string;
    url: string;
    filename: string;
  };
  onDelete?: (key: string) => void;
  onRename?: (oldKey: string, newFilename: string) => void;
  autoRename?: boolean;
  isClassifying?: boolean;
}

export function STLModelCard({ model, onDelete, onRename, autoRename = false }: STLModelCardProps) {
  const [showViewer, setShowViewer] = useState(false);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameSuccess, setRenameSuccess] = useState(false);

  // 判断是否为 Vercel Blob URL
  const isPrivateBlob = model.url.includes('blob.vercel-storage.com');
  
  // 本地文件：URL 已经是完整路径，包含子目录
  const viewUrl = isPrivateBlob 
    ? `/api/get-blob?url=${encodeURIComponent(model.url)}` 
    : model.url; // 本地文件直接使用 URL

  const handleDownload = async () => {
    try {
      let blob: Blob;
      
      if (isPrivateBlob) {
        const response = await fetch(viewUrl);
        blob = await response.blob();
      } else {
        // 本地文件：直接获取
        const response = await fetch(model.url);
        blob = await response.blob();
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = model.filename;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      alert('下载失败，请重试');
    }
  };

  // 执行重命名
  const doRename = async (newFilename: string): Promise<boolean> => {
    try {
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
        console.log(`[STLModelCard] Renamed: ${model.filename} → ${newFilename}`);
        if (onRename) {
          onRename(model.key, newFilename);
        }
        return true;
      } else {
        console.error('[STLModelCard] Rename failed:', data.error);
        return false;
      }
    } catch (error) {
      console.error('[STLModelCard] Rename error:', error);
      return false;
    }
  };

  // 自动重命名
  const handleAutoRename = async () => {
    if (!classification) return;
    
    setIsRenaming(true);
    
    // 生成新文件名：分类/原文件名.stl
    const categoryPrefix = classification.className.replace(/[/\s]/g, '_');
    const originalName = model.filename.replace('.stl', '').replace('.STL', '');
    const newFilename = `${categoryPrefix}/${originalName}.stl`;
    
    const success = await doRename(newFilename);
    
    if (success) {
      setRenameSuccess(true);
      alert(`✅ 重命名成功！\n\n旧名称: ${model.filename}\n新名称: ${newFilename}`);
      window.location.reload();
    } else {
      alert('重命名失败，请重试');
    }
    
    setIsRenaming(false);
  };

  // 分类回调 - 如果开启自动重命名，分类完成后自动执行
  const handleClassify = async (results: ClassificationResult[]) => {
    if (results.length > 0) {
      setClassification(results[0]);
      
      // 如果开启自动重命名，立即执行
      if (autoRename) {
        const categoryPrefix = results[0].className.replace(/[/\s]/g, '_');
        const originalName = model.filename.replace('.stl', '').replace('.STL', '');
        const newFilename = `${categoryPrefix}/${originalName}.stl`;
        
        setIsRenaming(true);
        const success = await doRename(newFilename);
        setIsRenaming(false);
        
        if (success) {
          setRenameSuccess(true);
          console.log(`[STLModelCard] Auto-renamed: ${model.filename} → ${newFilename}`);
        }
      }
    }
  };

  return (
    <Card className={`overflow-hidden transition-all ${renameSuccess ? 'ring-2 ring-green-400' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate" title={model.filename}>
              {renameSuccess && <CheckCircle2 className="w-4 h-4 inline mr-1 text-green-500" />}
              {model.filename}
            </CardTitle>
            <CardDescription className="truncate text-xs" title={model.key}>
              {model.key}
            </CardDescription>
          </div>
          {classification && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium whitespace-nowrap">
              🏷️ {classification.className}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showViewer && (
          <div className="mb-4">
            <STLViewer url={viewUrl} className="h-[300px] rounded-lg overflow-hidden" />
          </div>
        )}
        
        {/* AI 分类器 - 使用 model.url 作为识别源 */}
        {!renameSuccess && (
          <STLClassifier url={model.url} onClassify={handleClassify} />
        )}
        
        {/* 重命名状态提示 */}
        {isRenaming && (
          <div className="flex items-center gap-2 text-sm text-purple-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在重命名文件...
          </div>
        )}
        
        {renameSuccess && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded">
            <CheckCircle2 className="w-4 h-4" />
            已自动分类并重命名
          </div>
        )}
        
        {/* 操作按钮 */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowViewer(!showViewer)}
            className="flex-1"
          >
            <Eye className="w-4 h-4 mr-1" />
            {showViewer ? '隐藏' : '预览'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="flex-1"
          >
            <Download className="w-4 h-4 mr-1" />
            下载
          </Button>
          {classification && !autoRename && !renameSuccess && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoRename}
              disabled={isRenaming}
              className="flex-1 bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
            >
              {isRenaming ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <FolderSync className="w-4 h-4 mr-1" />
              )}
              {isRenaming ? '处理中...' : '归类收纳'}
            </Button>
          )}
          {onDelete && !renameSuccess && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(model.key)}
              className="text-red-500 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}