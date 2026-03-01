import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTemplateStore } from '@/store/templateStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Download, Check } from 'lucide-react';

interface ExportTemplatesDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ExportTemplatesDialog: React.FC<ExportTemplatesDialogProps> = ({ open, onClose }) => {
  const { templates } = useTemplateStore();
  const [copied, setCopied] = useState(false);
  
  const generateExportCode = () => {
    let output = '// Exported Templates from localStorage\n// Add this to /src/data/mockTemplatesWithFields.ts\n\n';
    output += `import { ClassTemplate, Organization, TrialType, TemplateStatus, TemplateType } from '@/types/template.types';\n\n`;
    
    const exportNames: string[] = [];
    
    templates.forEach((template) => {
      // Clean up the template name for a valid TypeScript constant name
      const constName = template.templateName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '') + '_TEMPLATE';
      
      exportNames.push(constName);
      
      // Create a clean copy without certain fields
      const cleanTemplate = { ...template };
      
      // Format the template for TypeScript
      output += `export const ${constName}: ClassTemplate = {\n`;
      
      // Add each property
      Object.entries(cleanTemplate).forEach(([key, value]) => {
        if (key === 'createdAt' || key === 'updatedAt') {
          output += `  ${key}: new Date('${value}'),\n`;
        } else if (typeof value === 'string') {
          // Escape single quotes in string values
          const escapedValue = value.replace(/'/g, "\\'");
          output += `  ${key}: '${escapedValue}',\n`;
        } else if (value === null) {
          output += `  ${key}: null,\n`;
        } else if (value === undefined) {
          output += `  ${key}: undefined,\n`;
        } else if (typeof value === 'boolean' || typeof value === 'number') {
          output += `  ${key}: ${value},\n`;
        } else {
          output += `  ${key}: ${JSON.stringify(value, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')},\n`;
        }
      });
      
      output += '};\n\n';
    });
    
    // Add export array instructions
    output += '\n// Add these to the STRUCTURED_TEMPLATES array:\n';
    output += 'export const STRUCTURED_TEMPLATES = [\n';
    output += '  AKC_SCENT_WORK_STRUCTURED_TEMPLATE,\n';
    output += '  AKC_AGILITY_STRUCTURED_TEMPLATE,\n';
    output += '  AKC_CONFORMATION_STRUCTURED_TEMPLATE,\n';
    exportNames.forEach(name => {
      output += `  ${name},\n`;
    });
    output += '];\n';
    
    return output;
  };
  
  const handleCopy = () => {
    const code = generateExportCode();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleDownload = () => {
    const code = generateExportCode();
    const blob = new Blob([code], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exported-templates.ts';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Export Templates to Mock Data</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Found {templates.length} templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex-1">
                      <div className="font-medium">{template.templateName}</div>
                      <div className="text-sm text-muted-foreground">
                        {template.organization} • {template.trialType} • v{template.version}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {template.classDefinitions?.length || 0} classes
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <div className="space-y-2">
            <h3 className="font-semibold">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Click "Copy Code" or "Download File" below</li>
              <li>Replace the contents of <code className="bg-muted px-1 rounded">/src/data/mockTemplatesWithFields.ts</code> with the exported code</li>
              <li>Save the file and your templates will be persisted as mock data</li>
              <li>You can then safely reset localStorage without losing your templates</li>
            </ol>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download File
          </Button>
          <Button onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy Code
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};