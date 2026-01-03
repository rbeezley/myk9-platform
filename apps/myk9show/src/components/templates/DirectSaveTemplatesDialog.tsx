import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTemplateStore } from '@/store/templateStore';
import { saveTemplatesFromLocalStorage } from '@/utils/saveTemplatesAPI';
import { Save, Check, AlertCircle, FileText, Zap, RefreshCw } from 'lucide-react';

interface DirectSaveTemplatesDialogProps {
  open: boolean;
  onClose: () => void;
}

export const DirectSaveTemplatesDialog: React.FC<DirectSaveTemplatesDialogProps> = ({ 
  open, 
  onClose 
}) => {
  const { templates } = useTemplateStore();
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    templatesCount: number;
    error?: string;
  } | null>(null);

  const handleDirectSave = async () => {
    setIsSaving(true);
    setResult(null);
    
    try {
      const saveResult = await saveTemplatesFromLocalStorage();
      setResult(saveResult);
    } catch (error) {
      setResult({
        success: false,
        message: 'Unexpected error occurred',
        templatesCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Save Templates Directly to File
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            This will automatically save your templates directly to <code>src/data/mockTemplatesWithFields.ts</code>.
            No downloads or manual file replacement needed!
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Templates to Save
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {templates.length} templates
              </div>
              <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between">
                    <span className="truncate">{template.templateName}</span>
                    <span className="text-muted-foreground ml-2 flex-shrink-0">
                      {template.classDefinitions?.length || 0} classes
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {result && (
            <Alert className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              {result.success ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={result.success ? "text-green-800" : "text-red-800"}>
                {result.message}
                {result.error && (
                  <div className="mt-1 text-xs">
                    Error: {result.error}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {result?.success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-2">✅ Success!</h4>
              <div className="text-sm text-green-800 space-y-1">
                <p>Your templates are now permanently saved to the mock data file.</p>
                <p className="font-medium">Next steps:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Reload the page to see your templates loaded from the file</li>
                  <li>You can now safely use "Reset to Mock Data" - your templates will persist</li>
                  <li>Your templates are now part of the codebase and will be version controlled</li>
                </ol>
              </div>
            </div>
          )}

          {!result && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Reads all templates from your localStorage</li>
                <li>Generates properly formatted TypeScript code</li>
                <li>Writes directly to <code>src/data/mockTemplatesWithFields.ts</code></li>
                <li>Your templates become permanent mock data instantly!</li>
              </ol>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {result?.success && (
            <Button onClick={handleReload} className="min-w-32">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload Page
            </Button>
          )}
          {!result && (
            <Button 
              onClick={handleDirectSave} 
              disabled={isSaving || templates.length === 0}
              className="min-w-32"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save to File
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};