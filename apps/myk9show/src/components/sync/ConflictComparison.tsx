import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { logger } from '@/services/LoggingService';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  Merge,
  RotateCcw,
  User,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConflictComparisonProps {
  conflict: {
    localData?: Record<string, unknown>;
    remoteData?: Record<string, unknown>;
    local?: Record<string, unknown>;
    remote?: Record<string, unknown>;
    conflictFields?: string[];
    [key: string]: unknown;
  };
  onResolve: (resolvedData: Record<string, unknown>) => void;
}

interface FieldComparison {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  selected: 'local' | 'remote' | 'custom';
  customValue?: unknown;
  isDifferent: boolean;
}

export const ConflictComparison: React.FC<ConflictComparisonProps> = ({
  conflict,
  onResolve,
}) => {
  const [fieldComparisons, setFieldComparisons] = useState<FieldComparison[]>([]);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [autoMergeAttempted, setAutoMergeAttempted] = useState(false);

  // Normalize conflict data
  const localData = React.useMemo(() => 
    conflict.localData || conflict.local || {}, 
    [conflict.localData, conflict.local]
  );
  const remoteData = React.useMemo(() => 
    conflict.remoteData || conflict.remote || {}, 
    [conflict.remoteData, conflict.remote]
  );
  const conflictFields: string[] = conflict.conflictFields || Object.keys({ ...localData, ...remoteData });

  React.useEffect(() => {
    const comparisons = conflictFields.map((field: string): FieldComparison => {
      const localValue = localData[field];
      const remoteValue = remoteData[field];
      const isDifferent = JSON.stringify(localValue) !== JSON.stringify(remoteValue);
      
      return {
        field,
        localValue,
        remoteValue,
        selected: 'local', // Default to local
        isDifferent,
      };
    });

    setFieldComparisons(comparisons);
  }, [conflict, conflictFields, localData, remoteData]);

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toLocaleDateString();
    return String(value);
  };

  const getFieldDisplayName = (field: string): string => {
    return field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const toggleFieldExpansion = (field: string) => {
    const newExpanded = new Set(expandedFields);
    if (newExpanded.has(field)) {
      newExpanded.delete(field);
    } else {
      newExpanded.add(field);
    }
    setExpandedFields(newExpanded);
  };

  const selectFieldValue = (field: string, source: 'local' | 'remote') => {
    setFieldComparisons(prev => 
      prev.map(comparison => 
        comparison.field === field 
          ? { ...comparison, selected: source }
          : comparison
      )
    );
  };

  const attemptAutoMerge = () => {
    setAutoMergeAttempted(true);
    
    // Simple auto-merge strategy: prefer newer timestamps, non-empty values
    setFieldComparisons(prev => 
      prev.map(comparison => {
        if (!comparison.isDifferent) return comparison;

        let selectedSource: 'local' | 'remote' = 'local';
        
        // Prefer non-empty values
        if (!comparison.localValue && comparison.remoteValue) {
          selectedSource = 'remote';
        } else if (comparison.localValue && !comparison.remoteValue) {
          selectedSource = 'local';
        }
        // For timestamps, prefer newer
        else if (comparison.field.toLowerCase().includes('time') || 
                 comparison.field.toLowerCase().includes('date')) {
          const localTime = new Date(comparison.localValue as string).getTime();
          const remoteTime = new Date(comparison.remoteValue as string).getTime();
          selectedSource = localTime > remoteTime ? 'local' : 'remote';
        }

        return { ...comparison, selected: selectedSource };
      })
    );
  };

  const resetSelections = () => {
    setFieldComparisons(prev => 
      prev.map(comparison => ({ ...comparison, selected: 'local' }))
    );
    setAutoMergeAttempted(false);
  };

  const handleResolve = () => {
    const resolvedData = { ...localData };
    
    fieldComparisons.forEach(comparison => {
      if (comparison.selected === 'remote') {
        resolvedData[comparison.field] = comparison.remoteValue;
      } else if (comparison.selected === 'custom' && comparison.customValue !== undefined) {
        resolvedData[comparison.field] = comparison.customValue;
      }
      // 'local' is already in resolvedData
    });

    onResolve(resolvedData);
  };

  const getDiffStats = () => {
    const total = fieldComparisons.length;
    const different = fieldComparisons.filter(c => c.isDifferent).length;
    const localSelected = fieldComparisons.filter(c => c.selected === 'local').length;
    const remoteSelected = fieldComparisons.filter(c => c.selected === 'remote').length;
    
    return { total, different, localSelected, remoteSelected };
  };

  const stats = getDiffStats();

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Review each conflicting field and choose which version to keep. 
            Different values are highlighted for easy comparison.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'side-by-side' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('side-by-side')}
              >
                Side by Side
              </Button>
              <Button
                variant={viewMode === 'unified' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('unified')}
              >
                Unified
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={attemptAutoMerge}
                disabled={autoMergeAttempted}
              >
                <Merge className="h-4 w-4 mr-2" />
                Auto Merge
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetSelections}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{stats.different} of {stats.total} fields conflict</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary">
                Local: {stats.localSelected}
              </Badge>
              <Badge variant="outline" className="text-secondary">
                Remote: {stats.remoteSelected}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Field Comparisons */}
      <ScrollArea className="max-h-96">
        <div className="space-y-3">
          {fieldComparisons.map((comparison, index) => (
            <motion.div
              key={comparison.field}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "border rounded-lg overflow-hidden",
                comparison.isDifferent && "border-warning/50 bg-warning/5",
                !comparison.isDifferent && "border-border/50"
              )}
            >
              <div 
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/20"
                onClick={() => toggleFieldExpansion(comparison.field)}
              >
                <div className="flex items-center gap-3">
                  {expandedFields.has(comparison.field) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-medium">{getFieldDisplayName(comparison.field)}</span>
                  {comparison.isDifferent && (
                    <Badge variant="secondary" className="text-xs">
                      Conflicted
                    </Badge>
                  )}
                  {!comparison.isDifferent && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Identical
                    </Badge>
                  )}
                </div>
                
                {comparison.isDifferent && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant={comparison.selected === 'local' ? 'default' : 'outline'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectFieldValue(comparison.field, 'local');
                      }}
                      className="h-7 px-2 text-xs"
                    >
                      <User className="h-3 w-3 mr-1" />
                      Local
                    </Button>
                    <Button
                      variant={comparison.selected === 'remote' ? 'default' : 'outline'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectFieldValue(comparison.field, 'remote');
                      }}
                      className="h-7 px-2 text-xs"
                    >
                      <GitBranch className="h-3 w-3 mr-1" />
                      Remote
                    </Button>
                  </div>
                )}
              </div>

              {expandedFields.has(comparison.field) && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="border-t border-border/50"
                >
                  {viewMode === 'side-by-side' ? (
                    <div className="grid grid-cols-2 divide-x divide-border/50">
                      {/* Local Value */}
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium text-primary">Local Value</span>
                          </div>
                          {comparison.isDifferent && (
                            <Button
                              variant={comparison.selected === 'local' ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => selectFieldValue(comparison.field, 'local')}
                              className="h-6 px-2 text-xs"
                            >
                              {comparison.selected === 'local' ? (
                                <Check className="h-3 w-3 mr-1" />
                              ) : null}
                              Use This
                            </Button>
                          )}
                        </div>
                        <div className="bg-background/50 border rounded-md p-3 text-sm font-mono max-h-32 overflow-auto">
                          <pre className="whitespace-pre-wrap">
                            {formatValue(comparison.localValue) || <span className="text-muted-foreground italic">Empty</span>}
                          </pre>
                        </div>
                      </div>

                      {/* Remote Value */}
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-secondary" />
                            <span className="text-sm font-medium text-secondary">Remote Value</span>
                          </div>
                          {comparison.isDifferent && (
                            <Button
                              variant={comparison.selected === 'remote' ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => selectFieldValue(comparison.field, 'remote')}
                              className="h-6 px-2 text-xs"
                            >
                              {comparison.selected === 'remote' ? (
                                <Check className="h-3 w-3 mr-1" />
                              ) : null}
                              Use This
                            </Button>
                          )}
                        </div>
                        <div className="bg-background/50 border rounded-md p-3 text-sm font-mono max-h-32 overflow-auto">
                          <pre className="whitespace-pre-wrap">
                            {formatValue(comparison.remoteValue) || <span className="text-muted-foreground italic">Empty</span>}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      {/* Unified diff view */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 bg-destructive rounded-full"></div>
                          <span className="font-medium">Removed (Local)</span>
                        </div>
                        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm font-mono">
                          <pre className="whitespace-pre-wrap">
                            {formatValue(comparison.localValue) || <span className="text-muted-foreground italic">Empty</span>}
                          </pre>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 bg-success rounded-full"></div>
                          <span className="font-medium">Added (Remote)</span>
                        </div>
                        <div className="bg-success/10 border border-success/20 rounded-md p-3 text-sm font-mono">
                          <pre className="whitespace-pre-wrap">
                            {formatValue(comparison.remoteValue) || <span className="text-muted-foreground italic">Empty</span>}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          Review your selections above, then apply the merge to resolve the conflict.
        </div>
        <Button
          onClick={handleResolve}
          className="bg-gradient-to-r from-primary to-secondary"
        >
          <Merge className="h-4 w-4 mr-2" />
          Apply Merge Resolution
        </Button>
      </div>
    </div>
  );
};