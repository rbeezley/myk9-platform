/**
 * ImportPanel - File import with drag-and-drop zone
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, RefreshCw } from 'lucide-react';

interface ImportPanelProps {
  isImporting: boolean;
  onImport: (file: File) => void;
}

export function ImportPanel({ isImporting, onImport }: ImportPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Data</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-4">
              Drag and drop your export file here, or click to browse
            </p>
            <Input
              type="file"
              accept=".json,.csv,.xlsx,.zip"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
              }}
              className="hidden"
              id="import-file"
            />
            <Label htmlFor="import-file" className="cursor-pointer">
              <Button variant="outline" disabled={isImporting}>
                {isImporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                  </>
                )}
              </Button>
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
