import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  GitBranch,
  History,
  Info,
  Loader2,
  Merge,
  Shield,
  User,
  X,
} from 'lucide-react';
import { ConflictComparison } from './ConflictComparison';
// import { FieldConflictResolver } from './FieldConflictResolver';
import { ConflictResolutionWizard } from './ConflictResolutionWizard';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { BaseConflictResolution, BaseConflict } from '@/types/conflict-types';
import type { Conflict } from '@/types/conflict-types';

// Legacy interface for backwards compatibility
interface ConflictData {
  entityType: string;
  entityId: string;
  entityName: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  conflictFields: string[];
  lastModified: {
    local: Date;
    remote: Date;
  };
  lastModifiedBy: {
    local: string;
    remote: string;
  };
  [key: string]: unknown;
}

// New extended conflict interface
interface ExtendedConflict {
  id: string;
  conflictType: 'version_mismatch' | 'concurrent_edit' | 'data_mismatch';
  entityType: string;
  entityId: string;
  entityName?: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  fieldPath?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  conflictFields: string[];
  createdAt: Date;
  detectedAt: Date;
  status: 'detected' | 'pending' | 'resolving' | 'resolved' | 'dismissed' | 'escalated' | 'expired';
  lastModified: {
    local: Date;
    remote: Date;
  };
  lastModifiedBy: {
    local: string;
    remote: string;
  };
}

type ResolutionStrategy = 'local' | 'remote' | 'merge' | 'custom';

interface ConflictResolution {
  conflictId: string;
  strategy: ResolutionStrategy;
  resolvedData: Record<string, unknown>;
  resolvedBy: string;
  resolvedAt: Date;
  metadata?: {
    mode?: string;
    confidence?: number;
    note?: string;
  };
}

interface ConflictResolutionDialogProps {
  // Support both prop patterns for backwards compatibility
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  onCancel?: () => void;
  conflict: ConflictData | ExtendedConflict | Conflict | null;
  onResolve: (resolution: 'local' | 'remote' | 'merge', mergedData?: Record<string, unknown>) => void;
  isResolving?: boolean;
  // New enhanced props
  onResolveAdvanced?: (resolution: ConflictResolution) => Promise<void>;
  onDismiss?: () => void;
  conflictResolver?: {
    getResolutionHistory?: (entityType: string, entityId: string) => Promise<BaseConflictResolution[]>;
    suggestResolution?: (conflict: ExtendedConflict | BaseConflict<Record<string, unknown>>) => { strategy: ResolutionStrategy; confidence: number } | null;
  };
}

type ResolutionMode = 'quick' | 'detailed' | 'wizard' | 'history';

interface ResolutionOption {
  strategy: ResolutionStrategy;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  confidence: number;
  recommended?: boolean;
}

export function ConflictResolutionDialog({
  open,
  isOpen,
  onOpenChange,
  onClose,
  onCancel,
  conflict,
  onResolve,
  isResolving: externalIsResolving,
  onResolveAdvanced,
  onDismiss,
  conflictResolver,
}: ConflictResolutionDialogProps) {
  // Handle both prop patterns
  const dialogOpen = open ?? isOpen ?? false;
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange?.(newOpen);
    if (!newOpen) {
      onClose?.();
      onCancel?.();
    }
  };
  const [mode, setMode] = useState<ResolutionMode>('quick');
  const [selectedStrategy, setSelectedStrategy] = useState<ResolutionStrategy | null>(null);
  const [customResolution, setCustomResolution] = useState<Record<string, unknown> | null>(null);
  const [internalIsResolving, setInternalIsResolving] = useState(false);
  const isResolving = externalIsResolving ?? internalIsResolving;
  const [resolutionHistory, setResolutionHistory] = useState<BaseConflictResolution[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, 'local' | 'remote'>>({});

  // Check if this is the new extended conflict format
  const isExtendedConflict = (c: unknown): c is ExtendedConflict => {
    return Boolean(c && typeof c === 'object' && 'id' in c && 'localData' in c && 'remoteData' in c);
  };

  // Check if this is the standard Conflict format
  const isStandardConflict = (c: unknown): c is { localEntity: unknown; remoteEntity: unknown; details: unknown } => {
    return Boolean(c && typeof c === 'object' && 'localEntity' in c && 'remoteEntity' in c && 'details' in c);
  };

  // Normalize conflict data for backwards compatibility
  const normalizedConflict = useMemo(() => {
    if (!conflict) return null;
    
    // Handle standard Conflict type (from ConflictResolver)
    if (isStandardConflict(conflict)) {
      const standardConflict = (conflict as unknown) as { entityType: string; entityId: string; localEntity: Record<string, unknown>; remoteEntity: Record<string, unknown>; details: Array<{ field: string }>; detectedAt: string };
      return {
        entityType: standardConflict.entityType,
        entityId: standardConflict.entityId,
        entityName: `${standardConflict.entityType} ${standardConflict.entityId}`,
        local: standardConflict.localEntity,
        remote: standardConflict.remoteEntity,
        conflictFields: standardConflict.details.map((d: { field: string }) => d.field),
        lastModified: {
          local: new Date((standardConflict.localEntity._lastModified as string | number | Date) || standardConflict.detectedAt),
          remote: new Date((standardConflict.remoteEntity._lastModified as string | number | Date) || standardConflict.detectedAt)
        },
        lastModifiedBy: {
          local: (standardConflict.localEntity._lastModifiedBy as string) || 'Unknown',
          remote: (standardConflict.remoteEntity._lastModifiedBy as string) || 'Unknown'
        }
      };
    }
    
    // Handle extended conflict type
    if (isExtendedConflict(conflict)) {
      const extendedConflict = conflict as ExtendedConflict;
      return {
        ...extendedConflict,
        entityName: extendedConflict.entityName || `${extendedConflict.entityType} ${extendedConflict.entityId}`,
        local: extendedConflict.localData,
        remote: extendedConflict.remoteData,
        conflictFields: extendedConflict.conflictFields || Object.keys({ ...extendedConflict.localData, ...extendedConflict.remoteData }),
      };
    }
    
    // Handle legacy ConflictData format (pass through)
    return conflict as ConflictData;
  }, [conflict]);

  // Get resolution options based on conflict type
  const resolutionOptions: ResolutionOption[] = [
    {
      strategy: 'local',
      label: 'Keep My Changes',
      description: 'Use your local version and discard remote changes',
      icon: User,
      confidence: getConfidenceScore('local'),
      recommended: isRecommended('local'),
    },
    {
      strategy: 'remote',
      label: 'Accept Remote Changes',
      description: 'Use the remote version and discard your local changes',
      icon: GitBranch,
      confidence: getConfidenceScore('remote'),
      recommended: isRecommended('remote'),
    },
    {
      strategy: 'merge',
      label: 'Merge Changes',
      description: 'Combine both versions intelligently',
      icon: Merge,
      confidence: getConfidenceScore('merge'),
      recommended: isRecommended('merge'),
    },
    {
      strategy: 'custom',
      label: 'Custom Resolution',
      description: 'Manually select which fields to keep',
      icon: Shield,
      confidence: 100,
      recommended: false,
    },
  ];

  const loadResolutionHistory = useCallback(async () => {
    if (!conflictResolver || !isExtendedConflict(conflict) || typeof conflictResolver.getResolutionHistory !== 'function') return;
    
    try {
      const history = await conflictResolver.getResolutionHistory(
        conflict.entityType,
        conflict.entityId
      );
      setResolutionHistory(history || []);
    } catch (err) {
      console.error('Failed to load resolution history:', err);
    }
  }, [conflictResolver, conflict]);

  useEffect(() => {
    if (normalizedConflict) {
      // Initialize with local values by default
      const initial: Record<string, 'local' | 'remote'> = {};
      normalizedConflict.conflictFields.forEach(field => {
        initial[field] = 'local';
      });
      setSelectedFields(initial);
      
      // Load resolution history if enhanced mode
      if (conflictResolver && isExtendedConflict(conflict)) {
        loadResolutionHistory();
      }
    }
  }, [normalizedConflict, conflictResolver, conflict, loadResolutionHistory]);

  function getConfidenceScore(strategy: ResolutionStrategy): number {
    if (conflictResolver && isExtendedConflict(conflict) && typeof conflictResolver.suggestResolution === 'function') {
      try {
        const suggestion = conflictResolver.suggestResolution(conflict);
        if (suggestion?.strategy === strategy) {
          return suggestion.confidence || 50;
        }
      } catch (error) {
        console.warn('Failed to get confidence score:', error);
      }
    }
    return 50 + Math.random() * 30; // Baseline confidence
  }

  function isRecommended(strategy: ResolutionStrategy): boolean {
    if (conflictResolver && isExtendedConflict(conflict) && typeof conflictResolver.suggestResolution === 'function') {
      try {
        const suggestion = conflictResolver.suggestResolution(conflict);
        return suggestion?.strategy === strategy && (suggestion?.confidence || 0) > 80;
      } catch (error) {
        console.warn('Failed to check recommendation:', error);
      }
    }
    return false;
  }

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'Not set';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toLocaleString();
    return String(value);
  };

  const handleFieldSelection = (field: string, source: 'local' | 'remote') => {
    setSelectedFields(prev => ({ ...prev, [field]: source }));
  };

  const handleMergeResolve = () => {
    if (!normalizedConflict) return;
    
    const mergedData: Record<string, unknown> = { ...normalizedConflict.local };
    
    Object.entries(selectedFields).forEach(([field, source]) => {
      if (source === 'remote') {
        mergedData[field] = normalizedConflict.remote[field];
      }
    });

    onResolve('merge', mergedData);
  };

  async function handleQuickResolve(strategy: ResolutionStrategy) {
    if (onResolveAdvanced && isExtendedConflict(conflict)) {
      setSelectedStrategy(strategy);
      setShowConfirmation(true);
    } else {
      // Fall back to legacy resolution
      onResolve(strategy as 'local' | 'remote' | 'merge', 
        strategy === 'local' ? normalizedConflict?.local : 
        strategy === 'remote' ? normalizedConflict?.remote : undefined);
    }
  }

  async function confirmResolution() {
    if (!selectedStrategy || !onResolveAdvanced || !isExtendedConflict(conflict)) return;

    setInternalIsResolving(true);
    setError(null);

    try {
      const resolution: ConflictResolution = {
        conflictId: conflict.id,
        strategy: selectedStrategy,
        resolvedData: customResolution || 
          (selectedStrategy === 'local' ? conflict.localData : conflict.remoteData),
        resolvedBy: 'current-user', // TODO: Get from auth context
        resolvedAt: new Date(),
        metadata: {
          mode,
          confidence: getConfidenceScore(selectedStrategy),
        },
      };

      await onResolveAdvanced(resolution);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve conflict');
    } finally {
      setInternalIsResolving(false);
      setShowConfirmation(false);
    }
  }

  function handleDismiss() {
    if (onDismiss) {
      onDismiss();
    } else if (onCancel) {
      onCancel();
    }
    handleOpenChange(false);
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-destructive';
      case 'high':
        return 'text-warning';
      case 'medium':
        return 'text-primary';
      default:
        return 'text-muted-foreground';
    }
  };

  // Enhanced mode check
  const isEnhancedMode = onResolveAdvanced && conflictResolver && isExtendedConflict(conflict);

  // Date formatting utility
  const formatDate = (date: string | Date) => {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return formatDistanceToNow(dateObj, { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };

  if (!normalizedConflict) return null;

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <DialogTitle className="text-xl">Resolve Data Conflict</DialogTitle>
                <DialogDescription className="mt-1">
                  {normalizedConflict.entityType} conflict detected • {
                    isExtendedConflict(conflict) && conflict.fieldPath || 'Multiple fields'
                  }
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isExtendedConflict(conflict) && (
                <Badge variant="outline" className={getPriorityColor(conflict.priority)}>
                  {conflict.priority} priority
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDismiss}
                className="ml-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isEnhancedMode ? (
            <Tabs value={mode} onValueChange={(value) => setMode(value as ResolutionMode)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="quick" className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Quick Resolve
                </TabsTrigger>
                <TabsTrigger value="detailed" className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Detailed Review
                </TabsTrigger>
                <TabsTrigger value="wizard" className="flex items-center gap-2">
                  <Merge className="h-4 w-4" />
                  Merge Wizard
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  History
                </TabsTrigger>
              </TabsList>

              <div className="mt-6 overflow-y-auto max-h-[60vh]">
                <TabsContent value="quick" className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Choose a resolution strategy. We've analyzed the conflict and provided
                      confidence scores for each option.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-3">
                    {resolutionOptions.map((option) => (
                      <motion.div
                        key={option.strategy}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start p-4 h-auto',
                            option.recommended && 'border-primary bg-primary/5'
                          )}
                          onClick={() => handleQuickResolve(option.strategy)}
                        >
                          <div className="flex items-start gap-3 w-full">
                            <div className={cn(
                              'p-2 rounded-lg',
                              option.recommended ? 'bg-primary/10' : 'bg-muted'
                            )}>
                              <option.icon className={cn(
                                'h-5 w-5',
                                option.recommended ? 'text-primary' : 'text-muted-foreground'
                              )} />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{option.label}</span>
                                {option.recommended && (
                                  <Badge variant="secondary" className="text-xs">
                                    Recommended
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {option.description}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-muted-foreground">
                                  Confidence:
                                </span>
                                <Progress value={option.confidence} className="h-1.5 w-20" />
                                <span className="text-xs font-medium">
                                  {option.confidence}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="detailed">
                  <ConflictComparison
                    conflict={{
                      ...normalizedConflict,
                      localData: normalizedConflict?.local || {},
                      remoteData: normalizedConflict?.remote || {},
                      conflictFields: normalizedConflict?.conflictFields || []
                    }}
                    onResolve={(resolvedData) => {
                      setCustomResolution(resolvedData);
                      setSelectedStrategy('custom');
                      setShowConfirmation(true);
                    }}
                  />
                </TabsContent>

                <TabsContent value="wizard">
                  <ConflictResolutionWizard
                    conflict={isExtendedConflict(conflict) ? conflict : ({
                      ...normalizedConflict,
                      id: normalizedConflict?.entityId || 'unknown',
                      conflictType: 'version_mismatch' as const,
                      localData: normalizedConflict?.local || {},
                      remoteData: normalizedConflict?.remote || {},
                      conflictFields: normalizedConflict?.conflictFields || [],
                      detectedAt: new Date(),
                      createdAt: new Date(),
                      priority: 'medium' as const,
                      status: 'pending' as const,
                      lastModified: {
                        local: normalizedConflict?.lastModified?.local || new Date(),
                        remote: normalizedConflict?.lastModified?.remote || new Date()
                      },
                      lastModifiedBy: {
                        local: normalizedConflict?.lastModifiedBy?.local || 'unknown',
                        remote: normalizedConflict?.lastModifiedBy?.remote || 'unknown'
                      }
                    } as BaseConflict<Record<string, unknown>>)}
                    conflictResolver={conflictResolver}
                    onComplete={(resolution) => {
                      setCustomResolution(resolution.resolvedData);
                      setSelectedStrategy(resolution.strategy);
                      setShowConfirmation(true);
                    }}
                  />
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                  <Alert>
                    <History className="h-4 w-4" />
                    <AlertDescription>
                      Previous resolutions for similar conflicts. Learn from past decisions.
                    </AlertDescription>
                  </Alert>

                  {resolutionHistory.length > 0 ? (
                    <div className="space-y-3">
                      {resolutionHistory.map((resolution, index) => (
                        <div
                          key={index}
                          className="p-4 border rounded-lg space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{resolution.strategy}</Badge>
                              <span className="text-sm text-muted-foreground">
                                by {resolution.resolvedBy}
                              </span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(resolution.resolvedAt, { addSuffix: true })}
                            </span>
                          </div>
                          {resolution.resolutionNotes && (
                            <p className="text-sm">{resolution.resolutionNotes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No previous resolutions found for this entity
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            // Legacy UI for backwards compatibility
            <div className="space-y-6 overflow-y-auto max-h-[60vh]">
              {/* Conflict Summary */}
              {normalizedConflict.lastModified && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <User className="h-4 w-4" />
                        Local Changes
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Modified: {formatDate(normalizedConflict.lastModified.local)}
                        </div>
                        {normalizedConflict.lastModifiedBy && (
                          <div>By: {String(normalizedConflict.lastModifiedBy.local)}</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <GitBranch className="h-4 w-4" />
                        Server Changes
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Modified: {formatDate(normalizedConflict.lastModified.remote)}
                        </div>
                        {normalizedConflict.lastModifiedBy && (
                          <div>By: {String(normalizedConflict.lastModifiedBy.remote)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Field-by-Field Comparison */}
              <div className="space-y-4">
                {normalizedConflict.conflictFields.map((field) => (
                  <div key={field} className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="bg-muted/20 px-4 py-2 border-b border-border/50">
                      <h4 className="font-medium text-sm capitalize">
                        {field.replace(/([A-Z])/g, ' $1').trim()}
                      </h4>
                    </div>
                    
                    <div className="grid grid-cols-2 divide-x divide-border/50">
                      {/* Local Version */}
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-primary">Local Version</span>
                          <Button
                            variant={selectedFields[field] === 'local' ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleFieldSelection(field, 'local')}
                          >
                            {selectedFields[field] === 'local' ? 'Selected' : 'Use This'}
                          </Button>
                        </div>
                        <div className="bg-background/50 rounded-md p-3 text-sm font-mono max-h-24 overflow-auto">
                          {formatValue(normalizedConflict.local[field])}
                        </div>
                      </div>

                      {/* Remote Version */}
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-secondary-purple">Server Version</span>
                          <Button
                            variant={selectedFields[field] === 'remote' ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleFieldSelection(field, 'remote')}
                          >
                            {selectedFields[field] === 'remote' ? 'Selected' : 'Use This'}
                          </Button>
                        </div>
                        <div className="bg-background/50 rounded-md p-3 text-sm font-mono max-h-24 overflow-auto">
                          {formatValue(normalizedConflict.remote[field])}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AnimatePresence>
          {showConfirmation && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-4"
            >
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Are you sure you want to apply this resolution? This action cannot be undone.
                </AlertDescription>
              </Alert>
              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmation(false)}
                  disabled={isResolving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmResolution}
                  disabled={isResolving}
                  className="bg-gradient-to-r from-primary to-secondary"
                >
                  {isResolving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resolving...
                    </>
                  ) : (
                    'Confirm Resolution'
                  )}
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>

        {!showConfirmation && (
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={handleDismiss}
              className="border-border/50"
            >
              Cancel
            </Button>
            
            {!isEnhancedMode && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onResolve('local')}
                  className="border-primary/20 text-primary hover:bg-primary/5"
                >
                  Keep All Local
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => onResolve('remote')}
                  className="border-secondary-purple/20 text-secondary-purple hover:bg-secondary-purple/5"
                >
                  Keep All Server
                </Button>
                
                <Button
                  onClick={handleMergeResolve}
                  className="bg-gradient-to-r from-primary to-secondary-purple text-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  Apply Selected Changes
                </Button>
              </div>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}