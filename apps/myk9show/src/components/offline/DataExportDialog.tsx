import React, { useState, useEffect } from 'react';
import { Download, FileText, Database, Settings, X, ChevronDown } from 'lucide-react';
import {
import { logger } from '@/services/LoggingService';
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Separator } from '../ui/separator';
import { 
  offlineDataExportService, 
  ExportOptions, 
  ExportProgress, 
  EntityType,
  ExportFormat 
} from '../../services/offline/OfflineDataExportService';

interface DataExportDialogProps {
  trigger?: React.ReactNode;
  showId?: string;
  clubId?: string;
}

export const DataExportDialog: React.FC<DataExportDialogProps> = ({
  trigger,
  showId,
  clubId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'csv',
    entities: ['dogs', 'people'],
    includeMetadata: true,
    showId,
    clubId
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [estimation, setEstimation] = useState<{
    estimatedItems: number;
    estimatedSize: string;
    estimatedTime: string;
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const availableEntities = offlineDataExportService.getAvailableEntities();
  const formats: { value: ExportFormat; label: string; description: string }[] = [
    { value: 'csv', label: 'CSV', description: 'Spreadsheet-compatible format' },
    { value: 'json', label: 'JSON', description: 'Structured data format' },
    { value: 'pdf', label: 'PDF', description: 'Printable document format' }
  ];

  // Update estimation when options change
  useEffect(() => {
    if (exportOptions.entities.length > 0) {
      offlineDataExportService.estimateExport(exportOptions)
        .then(setEstimation)
        .catch(() => setEstimation(null));
    }
  }, [exportOptions]);

  const handleEntityToggle = (entityType: EntityType, checked: boolean) => {
    setExportOptions(prev => ({
      ...prev,
      entities: checked
        ? [...prev.entities, entityType]
        : prev.entities.filter(e => e !== entityType)
    }));
  };

  const handleExport = async () => {
    if (exportOptions.entities.length === 0) return;

    setIsExporting(true);
    setExportProgress(null);

    try {
      const result = await offlineDataExportService.exportData(
        exportOptions,
        setExportProgress
      );

      if (result.success) {
        setIsOpen(false);
        // Show success notification
        logger.debug('Export completed successfully:', 'offline', { data: result });
      } else {
        logger.error('Export failed:', 'offline', { detail: result.error });
        // Show error notification
      }
    } catch (error) {
      logger.error('Export error:', 'components', {}, error as Error);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleCancel = () => {
    if (isExporting) {
      offlineDataExportService.cancelExport();
    }
    setIsExporting(false);
    setExportProgress(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Data
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Export Data
          </DialogTitle>
          <DialogDescription>
            Export your data in various formats for backup or external use.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Export Format</Label>
            <Select
              value={exportOptions.format}
              onValueChange={(value: ExportFormat) =>
                setExportOptions(prev => ({ ...prev, format: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formats.map(format => (
                  <SelectItem key={format.value} value={format.value}>
                    <div>
                      <div className="font-medium">{format.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {format.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entity Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Data to Export</Label>
            <div className="grid grid-cols-1 gap-3">
              {availableEntities.map(entity => (
                <div key={entity.key} className="flex items-start space-x-3">
                  <Checkbox
                    id={entity.key}
                    checked={exportOptions.entities.includes(entity.key)}
                    onCheckedChange={(checked) =>
                      handleEntityToggle(entity.key, checked as boolean)
                    }
                  />
                  <div className="flex-1">
                    <Label htmlFor={entity.key} className="font-medium cursor-pointer">
                      {entity.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {entity.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Advanced Options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Advanced Options
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeMetadata"
                    checked={exportOptions.includeMetadata}
                    onCheckedChange={(checked) =>
                      setExportOptions(prev => ({ ...prev, includeMetadata: checked as boolean }))
                    }
                  />
                  <Label htmlFor="includeMetadata">Include metadata and timestamps</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filename">Custom filename (optional)</Label>
                  <Input
                    id="filename"
                    placeholder="Leave empty for auto-generated name"
                    value={exportOptions.filename || ''}
                    onChange={(e) =>
                      setExportOptions(prev => ({ ...prev, filename: e.target.value || undefined }))
                    }
                  />
                </div>

                {/* Date Range Filter */}
                {(exportOptions.entities.includes('shows') || exportOptions.entities.includes('entries')) && (
                  <div className="space-y-2">
                    <Label>Date Range Filter (optional)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="startDate" className="text-xs">Start Date</Label>
                        <Input
                          id="startDate"
                          type="date"
                          onChange={(e) => {
                            const start = e.target.value ? new Date(e.target.value) : undefined;
                            setExportOptions(prev => ({
                              ...prev,
                              dateRange: start && prev.dateRange?.end
                                ? { start, end: prev.dateRange.end }
                                : start
                                ? { start, end: new Date() }
                                : undefined
                            }));
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor="endDate" className="text-xs">End Date</Label>
                        <Input
                          id="endDate"
                          type="date"
                          onChange={(e) => {
                            const end = e.target.value ? new Date(e.target.value) : undefined;
                            setExportOptions(prev => ({
                              ...prev,
                              dateRange: end && prev.dateRange?.start
                                ? { start: prev.dateRange.start, end }
                                : end
                                ? { start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), end }
                                : undefined
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Export Estimation */}
          {estimation && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="font-medium">Export Preview</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Items</div>
                  <div className="font-medium">{estimation.estimatedItems.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Est. Size</div>
                  <div className="font-medium">{estimation.estimatedSize}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Est. Time</div>
                  <div className="font-medium">{estimation.estimatedTime}</div>
                </div>
              </div>
            </div>
          )}

          {/* Export Progress */}
          {isExporting && exportProgress && (
            <div className="space-y-3">
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {exportProgress.stage}
                  </span>
                  <Badge variant="secondary">
                    {Math.round(exportProgress.progress)}%
                  </Badge>
                </div>
                <Progress value={exportProgress.progress} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {exportProgress.processedItems} of {exportProgress.totalItems} items
                  </span>
                  {exportProgress.estimatedTimeRemaining && (
                    <span>
                      ~{Math.round(exportProgress.estimatedTimeRemaining)}s remaining
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => isExporting ? handleCancel() : setIsOpen(false)}
            >
              {isExporting ? (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Cancel Export
                </>
              ) : (
                'Close'
              )}
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || exportOptions.entities.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Start Export'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};