/**
 * ExportPanel - Export data configuration and execution
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, RefreshCw } from 'lucide-react';
import type { ExportOptions, EntityInfo } from './types';

interface ExportPanelProps {
  exportOptions: ExportOptions;
  onExportOptionsChange: (options: ExportOptions) => void;
  availableEntities: EntityInfo[];
  isExporting: boolean;
  onExport: () => void;
}

export function ExportPanel({
  exportOptions,
  onExportOptionsChange,
  availableEntities,
  isExporting,
  onExport,
}: ExportPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Export Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export Format */}
        <div className="space-y-2">
          <Label>Export Format</Label>
          <Select
            value={exportOptions.format}
            onValueChange={(value: 'json' | 'csv' | 'xlsx') =>
              onExportOptionsChange({ ...exportOptions, format: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON (Recommended)</SelectItem>
              <SelectItem value="csv">CSV (Spreadsheet)</SelectItem>
              <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Entity Selection */}
        <div className="space-y-3">
          <Label>Data to Export</Label>
          <div className="grid grid-cols-2 gap-3">
            {availableEntities.map((entity) => (
              <div key={entity.id} className="flex items-center space-x-2">
                <Checkbox
                  id={entity.id}
                  checked={exportOptions.entities.includes(entity.id)}
                  onCheckedChange={(checked) => {
                    const updatedEntities = checked
                      ? [...exportOptions.entities, entity.id]
                      : exportOptions.entities.filter(e => e !== entity.id);
                    onExportOptionsChange({ ...exportOptions, entities: updatedEntities });
                  }}
                />
                <Label htmlFor={entity.id} className="flex items-center gap-2">
                  <span>{entity.icon}</span>
                  <span>{entity.label}</span>
                  <Badge variant="outline" className="text-xs">
                    {entity.count}
                  </Badge>
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Export Options */}
        <div className="space-y-3">
          <Label>Options</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeDeleted"
                checked={exportOptions.includeDeleted}
                onCheckedChange={(checked) =>
                  onExportOptionsChange({ ...exportOptions, includeDeleted: !!checked })
                }
              />
              <Label htmlFor="includeDeleted">Include deleted items</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="compressed"
                checked={exportOptions.compressed}
                onCheckedChange={(checked) =>
                  onExportOptionsChange({ ...exportOptions, compressed: !!checked })
                }
              />
              <Label htmlFor="compressed">Compress export file</Label>
            </div>
          </div>
        </div>

        {/* Export Button */}
        <Button
          onClick={onExport}
          disabled={isExporting || exportOptions.entities.length === 0}
          className="w-full"
        >
          {isExporting ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
