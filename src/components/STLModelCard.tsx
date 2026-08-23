'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { STLViewer } from './STLViewer';
import { Download, Eye, Trash2, Loader2, CheckCircle2 } from 'lucide-react';

interface STLModelCardProps {
  model: {
    key: string;
    url: string;
    filename: string;
    category?: string;
    displayName?: string;
  };
  onDelete?: (key: string) => void;
  onRename?: (oldKey: string, newFilename: string) => void;
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

function getAdminKey(): string {
  const saved = localStorage.getItem(ADMIN_KEY_STORAGE) || '';
  if (saved) return saved;
  const next = prompt('请输入管理员密钥（ADMIN_KEY）') || '';
  if (next) localStorage.setItem(ADMIN_KEY_STORAGE, next);
  return next;
}

export function STLModelCard({ model, onDelete }: STLModelCardProps) {
  const [showViewer, setShowViewer] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const isPrivateBlob = model.url.includes('blob.vercel-storage.com');
  const viewUrl = isPrivateBlob
    ? `/api/get-blob?url=${encodeURIComponent(model.url)}`
    : model.url;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(viewUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = model.filename;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      alert('下载失败，请重试');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate" title={model.filename}>
              {model.displayName || model.filename}
            </CardTitle>
            {model.category && (
              <CardDescription className="text-xs mt-0.5">
                📂 {model.category}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showViewer && (
          <div className="mb-4">
            <STLViewer url={viewUrl} className="h-[300px] rounded-lg overflow-hidden" />
          </div>
        )}
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
            disabled={downloading}
            className="flex-1"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1" />
            )}
            {downloading ? '下载中' : '下载'}
          </Button>
          {onDelete && (
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
