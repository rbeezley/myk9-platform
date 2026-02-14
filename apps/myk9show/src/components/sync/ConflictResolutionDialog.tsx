import { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  CheckCircle,
  GitBranch,
  History,
  Info,
  Merge,
  Shield,
  User,
} from 'lucide-react';
import { ConflictComparison } from './ConflictComparison';
// import { FieldConflictResolver } from './FieldConflictResolver';
import { ConflictResolutionWizard } from './ConflictResolutionWizard';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { BaseConflictResolution, BaseConflict } from '@/types/conflict-types';
import type {
  ConflictResolutionDialogProps,
  ConflictResolution,
  ResolutionStrategy,
  ResolutionMode,
  ResolutionOption,
} from './conflict-resolution-types';
import {
  isExtendedConflict,
  normalizeConflict,
  getConfidenceScore,
  isRecommended,
} from './conflict-resolution-utils';
import { QuickResolveTab } from './conflict-resolution/QuickResolveTab';
import { HistoryTab } from './conflict-resolution/HistoryTab';
import { LegacyConflictView } from './conflict-resolution/LegacyConflictView';
import { ConfirmationOverlay } from './conflict-resolution/ConfirmationOverlay';
import { ConflictDialogHeader } from './conflict-resolution/ConflictDialogHeader';
import { ConflictDialogFooter } from './conflict-resolution/ConflictDialogFooter';

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
  const { user } = useAuthContext();

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

  // Normalize conflict data for backwards compatibility
  const normalizedConflict = useMemo(() => normalizeConflict(conflict), [conflict]);

  // Get resolution options based on conflict type
  const resolutionOptions: ResolutionOption[] = [
    {
      strategy: 'local',
      label: 'Keep My Changes',
      description: 'Use your local version and discard remote changes',
      icon: User,
      confidence: getConfidenceScore('local', conflictResolver, conflict),
      recommended: isRecommended('local', conflictResolver, conflict),
    },
    {
      strategy: 'remote',
      label: 'Accept Remote Changes',
      description: 'Use the remote version and discard your local changes',
      icon: GitBranch,
      confidence: getConfidenceScore('remote', conflictResolver, conflict),
      recommended: isRecommended('remote', conflictResolver, conflict),
    },
    {
      strategy: 'merge',
      label: 'Merge Changes',
      description: 'Combine both versions intelligently',
      icon: Merge,
      confidence: getConfidenceScore('merge', conflictResolver, conflict),
      recommended: isRecommended('merge', conflictResolver, conflict),
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
      logger.error('Failed to load resolution history:', 'sync', {}, err as Error);
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
        resolvedBy: user?.id || 'unknown',
        resolvedAt: new Date(),
        metadata: {
          mode,
          confidence: getConfidenceScore(selectedStrategy, conflictResolver, conflict),
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

  // Enhanced mode check
  const isEnhancedMode = onResolveAdvanced && conflictResolver && isExtendedConflict(conflict);

  if (!normalizedConflict) return null;

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <ConflictDialogHeader
          normalizedConflict={normalizedConflict}
          conflict={conflict}
          onDismiss={handleDismiss}
        />

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
                <TabsContent value="quick">
                  <QuickResolveTab
                    resolutionOptions={resolutionOptions}
                    onQuickResolve={handleQuickResolve}
                  />
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

                <TabsContent value="history">
                  <HistoryTab resolutionHistory={resolutionHistory} />
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <LegacyConflictView
              normalizedConflict={normalizedConflict}
              selectedFields={selectedFields}
              onFieldSelection={handleFieldSelection}
            />
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
            <ConfirmationOverlay
              isResolving={isResolving}
              onCancel={() => setShowConfirmation(false)}
              onConfirm={confirmResolution}
            />
          )}
        </AnimatePresence>

        {!showConfirmation && (
          <ConflictDialogFooter
            isEnhancedMode={!!isEnhancedMode}
            onDismiss={handleDismiss}
            onResolveLocal={() => onResolve('local')}
            onResolveRemote={() => onResolve('remote')}
            onMergeResolve={handleMergeResolve}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
