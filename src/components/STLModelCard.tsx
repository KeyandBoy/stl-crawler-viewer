'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { STLViewer } from './STLViewer';
import { Download, Eye, Trash2 } from 'lucide-react';

interface STLModelCardProps {
  model: {
    key: string;
    url: string;
    filename: string;
  };
  onDelete?: (key: string) => void;
}

export function STLModelCard({ model, onDelete }: STLModelCardProps) {
  const [showViewer, setShowViewer] = useState(false);

  const handleDownload = async () => {
    try {
      const response = await fetch(model.url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = model.filename;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg truncate">{model.filename}</CardTitle>
        <CardDescription className="truncate text-xs">{model.key}</CardDescription>
      </CardHeader>
      <CardContent>
        {showViewer && (
          <div className="mb-4">
            <STLViewer url={model.url} className="h-[400px] rounded-lg overflow-hidden" />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowViewer(!showViewer)}
            className="flex-1"
          >
            <Eye className="w-4 h-4 mr-2" />
            {showViewer ? 'Hide' : 'View'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="flex-1"
          >
            <Download className="w-4 h-4 mr-2" />
            Download
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
