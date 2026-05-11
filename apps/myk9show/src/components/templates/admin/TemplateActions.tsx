import React, { useRef, useState } from 'react';
import { useTemplateStore } from '@/store/templateStore';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Download, Upload, MoreHorizontal, RefreshCw } from 'lucide-react';
import { TemplateImportExport, ClassTemplate } from '@/types/template.types';
import { useAuthContext } from '@/hooks/useAuthContext';

export const TemplateActions: React.FC = () => {
  const { user } = useAuthContext();
  const { templates, importTemplate, initializeDefaultTemplates } = useTemplateStore();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportAll = () => {
    const exportData = {
      templates: templates.filter(t => !t.isOfficial), // Only export custom templates
      exportedAt: new Date(),
      exportedBy: user?.id || 'unknown',
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        // Check if it's a single template or multiple templates
        if (data.template) {
          // Single template format
          const result = importTemplate(data as TemplateImportExport, user?.id || 'unknown');
          if (result) {
            setImportError(null);
            setImportDialogOpen(true);
          } else {
            setImportError('Failed to import template. Please check the file format.');
          }
        } else if (data.templates && Array.isArray(data.templates)) {
          // Multiple templates format
          let imported = 0;
          data.templates.forEach((template: Record<string, unknown>) => {
            const templateData: TemplateImportExport = {
              template: template as Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'>,
              exportedAt: new Date(data.exportedAt || Date.now()),
              exportedBy: data.exportedBy || 'unknown',
              exportFormat: '1.0'
            };
            
            const result = importTemplate(templateData, user?.id || 'unknown');
            if (result) imported++;
          });
          
          if (imported > 0) {
            setImportError(null);
            setImportDialogOpen(true);
          } else {
            setImportError('No templates could be imported. Please check the file format.');
          }
        } else {
          setImportError('Invalid file format. Please select a valid template export file.');
        }
      } catch {
        setImportError('Failed to parse template file. Please ensure it\'s a valid JSON file.');
      }
    };
    
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReinitializeTemplates = () => {
    initializeDefaultTemplates();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild nativeButton>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="h-4 w-4 mr-2" />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleExportAll}>
            <Download className="mr-2 h-4 w-4" />
            Export All Templates
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleImportClick}>
            <Upload className="mr-2 h-4 w-4" />
            Import Templates
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleReinitializeTemplates}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload Default Templates
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Import Success Dialog */}
      <AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Successful</AlertDialogTitle>
            <AlertDialogDescription>
              Templates have been imported successfully. You can now edit and use them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setImportDialogOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Error Dialog */}
      <AlertDialog open={!!importError} onOpenChange={() => setImportError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Failed</AlertDialogTitle>
            <AlertDialogDescription>
              {importError}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setImportError(null)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
