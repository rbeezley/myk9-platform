import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTemplateStore } from '@/store/templateStore';
import { autoSaveTemplatesToMockData } from '@/utils/autoSaveTemplates';
import { Download, Check, AlertCircle, FileText, Zap } from 'lucide-react';

interface AutoSaveTemplatesDialogProps {
  open: boolean;
  onClose: () => void;
}

export const AutoSaveTemplatesDialog: React.FC<AutoSaveTemplatesDialogProps> = ({ 
  open, 
  onClose 
}) => {
  const { templates } = useTemplateStore();
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    templatesCount: number;
  } | null>(null);

  const handleAutoSave = async () => {
    setIsSaving(true);
    setResult(null);
    
    try {
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const saveResult = autoSaveTemplatesToMockData();
      setResult(saveResult);
    } catch {
      setResult({
        success: false,
        message: 'Unexpected error occurred',
        templatesCount: 0
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Auto-Save Templates to Mock Data
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            This will automatically generate a properly formatted TypeScript file with all your templates.
            No manual editing required!
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
              <div className="space-y-1 text-sm">
                {templates.slice(0, 5).map((template) => (
                  <div key={template.id} className="flex items-center justify-between">
                    <span>{template.templateName}</span>
                    <span className="text-muted-foreground">
                      {template.classDefinitions?.length || 0} classes
                    </span>
                  </div>
                ))}
                {templates.length > 5 && (
                  <div className="text-muted-foreground">
                    ...and {templates.length - 5} more
                  </div>
                )}
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
              </AlertDescription>
            </Alert>
          )}

          {!result && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Exports all templates from localStorage</li>
                <li>Generates proper TypeScript code with correct enums</li>
                <li>Downloads a new <code>mockTemplatesWithFields.ts</code> file</li>
                <li>You replace the existing file in <code>src/data/</code></li>
                <li>Your templates become permanent mock data!</li>
              </ol>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button 
              onClick={handleAutoSave} 
              disabled={isSaving || templates.length === 0}
              className="min-w-32"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Auto-Save Templates
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};