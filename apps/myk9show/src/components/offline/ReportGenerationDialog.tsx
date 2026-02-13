import React, { useState, useMemo } from 'react';
import { FileText, Printer, Download, Settings, ChevronDown } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import {
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import {
  offlineReportService,
  ReportOptions,
  ReportType
} from '../../services/offline/OfflineReportService';
import { useShowStore } from '@/store/showStore';

interface ReportGenerationDialogProps {
  trigger?: React.ReactNode;
  showId: string;
  defaultReportType?: ReportType;
}

export const ReportGenerationDialog: React.FC<ReportGenerationDialogProps> = ({
  trigger,
  showId,
  defaultReportType = 'entry-list'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [reportOptions, setReportOptions] = useState<ReportOptions>({
    type: defaultReportType,
    showId,
    format: 'pdf',
    includePhotos: false,
    includeSummary: true
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const show = useShowStore(state => state.getShowById(showId));
  const assignedJudges = useMemo(() => show?.assignedJudges ?? [], [show]);

  const availableReports = offlineReportService.getAvailableReports();

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    
    try {
      const result = await offlineReportService.generateReport(reportOptions);
      
      if (result.success) {
        setIsOpen(false);
        // Show success notification
        logger.debug('Report generated successfully:', 'offline', { data: result.filename });
      } else {
        logger.error('Report generation failed:', 'offline', { detail: result.error });
        // Show error notification
      }
    } catch (error) {
      logger.error('Report generation error:', 'components', {}, error as Error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getReportDescription = (type: ReportType): string => {
    switch (type) {
      case 'entry-list':
        return 'Complete list of all entries with dog and exhibitor details';
      case 'class-schedule':
        return 'Ring assignments and timing for all classes';
      case 'judge-book':
        return 'Judging assignments with entry details for each class';
      case 'results':
        return 'Placement lists and awards for all completed classes';
      case 'show-summary':
        return 'Statistics and overview of the entire show';
      default:
        return '';
    }
  };

  const getReportFeatures = (type: ReportType): string[] => {
    switch (type) {
      case 'entry-list':
        return [
          'Entry statistics by class',
          'Dog and exhibitor information',
          'Catalog numbers and armbands',
          'Breed breakdown'
        ];
      case 'class-schedule':
        return [
          'Class timing and ring assignments',
          'Judge assignments',
          'Entry counts per class',
          'Ring summary'
        ];
      case 'judge-book':
        return [
          'Judging forms for each class',
          'Space for placement notes',
          'Entry details per class',
          'Judge-specific sections'
        ];
      case 'results':
        return [
          'Placement lists by class',
          'Points and awards',
          'Winner information',
          'Class completion status'
        ];
      case 'show-summary':
        return [
          'Show statistics and metrics',
          'Breed popularity analysis',
          'Judge assignment summary',
          'Entry trends and insights'
        ];
      default:
        return [];
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Generate Reports
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Generate Report
          </DialogTitle>
          <DialogDescription>
            Generate professional reports for your show data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Report Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Report Type</Label>
            <div className="grid gap-3">
              {availableReports.map(report => (
                <Card 
                  key={report.key}
                  className={`cursor-pointer transition-colors ${
                    reportOptions.type === report.key 
                      ? 'border-primary bg-primary/5' 
                      : 'hover:border-primary/50'
                  }`}
                  onClick={() => setReportOptions(prev => ({ ...prev, type: report.key }))}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{report.label}</CardTitle>
                      {reportOptions.type === report.key && (
                        <Badge>Selected</Badge>
                      )}
                    </div>
                    <CardDescription className="text-sm">
                      {report.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium mb-1">Includes:</div>
                      <ul className="space-y-0.5">
                        {getReportFeatures(report.key).map((feature, index) => (
                          <li key={index}>• {feature}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Report Options */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Report Options</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeSummary"
                  checked={reportOptions.includeSummary}
                  onCheckedChange={(checked) =>
                    setReportOptions(prev => ({ ...prev, includeSummary: checked as boolean }))
                  }
                />
                <Label htmlFor="includeSummary">Include summary statistics</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includePhotos"
                  checked={reportOptions.includePhotos}
                  onCheckedChange={(checked) =>
                    setReportOptions(prev => ({ ...prev, includePhotos: checked as boolean }))
                  }
                />
                <Label htmlFor="includePhotos">Include photos (where available)</Label>
              </div>
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
                {/* Custom Title */}
                <div className="space-y-2">
                  <Label htmlFor="customTitle">Custom report title (optional)</Label>
                  <Input
                    id="customTitle"
                    placeholder="Leave empty for default title"
                    value={reportOptions.title || ''}
                    onChange={(e) => {
                      const newTitle = e.target.value;
                      if (newTitle) {
                        setReportOptions(prev => ({ ...prev, title: newTitle }));
                      } else {
                        // Remove title property when empty
                        setReportOptions(prev => {
                          const { title: _, ...rest } = prev;
                          return rest as ReportOptions;
                        });
                      }
                    }}
                  />
                </div>

                {/* Judge Filter for Judge Book */}
                {reportOptions.type === 'judge-book' && (
                  <div className="space-y-2">
                    <Label htmlFor="judgeFilter">Filter by judge (optional)</Label>
                    <Select
                      value={reportOptions.judgeId || ''}
                      onValueChange={(value) => {
                        if (value) {
                          setReportOptions(prev => ({ ...prev, judgeId: value }));
                        } else {
                          // Remove judgeId property when empty
                          setReportOptions(prev => {
                            const { judgeId: _, ...rest } = prev;
                            return rest as ReportOptions;
                          });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All judges" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All judges</SelectItem>
                        {assignedJudges.map((judge) => (
                          <SelectItem key={judge.judgeId} value={judge.judgeId}>
                            {judge.judgeName}
                          </SelectItem>
                        ))}
                        {assignedJudges.length === 0 && (
                          <SelectItem value="" disabled>
                            No judges assigned to this show
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Class Filter */}
                <div className="space-y-2">
                  <Label htmlFor="classFilter">Filter by classes (optional)</Label>
                  <div className="text-sm text-muted-foreground mb-2">
                    Leave empty to include all classes. Enter class names or IDs separated by commas.
                  </div>
                  <Input
                    id="classFilter"
                    placeholder="e.g., Novice A, Open B, or class IDs"
                    value={reportOptions.classIds?.join(', ') || ''}
                    onChange={(e) => {
                      const classIds = e.target.value
                        .split(',')
                        .map(id => id.trim())
                        .filter(id => id.length > 0);
                      if (classIds.length > 0) {
                        setReportOptions(prev => ({ ...prev, classIds }));
                      } else {
                        setReportOptions(prev => {
                          const { classIds: _, ...rest } = prev;
                          return rest as ReportOptions;
                        });
                      }
                    }}
                  />
                  {reportOptions.classIds && reportOptions.classIds.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {reportOptions.classIds.map((id, index) => (
                        <Badge key={index} variant="secondary" className="text-xs gap-1">
                          {id}
                          <button
                            type="button"
                            className="ml-1 hover:text-destructive"
                            onClick={() => {
                              const newClassIds = reportOptions.classIds!.filter((_, i) => i !== index);
                              if (newClassIds.length > 0) {
                                setReportOptions(prev => ({ ...prev, classIds: newClassIds }));
                              } else {
                                setReportOptions(prev => {
                                  const { classIds: _, ...rest } = prev;
                                  return rest as ReportOptions;
                                });
                              }
                            }}
                            aria-label={`Remove ${id}`}
                          >
                            &times;
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Report Preview */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="font-medium">Report Preview</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {getReportDescription(reportOptions.type)}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Format: PDF</span>
              <span>Estimated pages: 5-15</span>
              <span>Generation time: ~30 seconds</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {isGenerating ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};