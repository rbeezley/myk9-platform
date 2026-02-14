import React from 'react';
import { Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderActionsProps {
  onDownloadTemplate: () => void;
  onImportClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onCSVImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function HeaderActions({
  onDownloadTemplate,
  onImportClick,
  fileInputRef,
  onCSVImport
}: HeaderActionsProps) {
  return (
    <div className="apple-show-info-card">
      <div className="apple-show-info-header">
        <div>
          <div className="apple-show-info-title">Bulk Result Entry</div>
          <p className="text-sm text-muted-foreground mt-1">
            Enter results for multiple entries quickly
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={onDownloadTemplate}
            className="apple-action-button"
          >
            <Download className="h-4 w-4" />
            <span>Download Template</span>
          </Button>

          <Button
            variant="outline"
            onClick={onImportClick}
            className="apple-action-button"
          >
            <Upload className="h-4 w-4" />
            <span>Import CSV</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={onCSVImport}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}
