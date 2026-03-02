import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BasePanelProps, EntityCreationResult } from './types';

// Import specific entity panels (we'll create these next)
import { ClubCreationPanel } from './entities/ClubCreationPanel';
import { UserCreationPanel } from './entities/UserCreationPanel';
import { JudgeCreationPanel } from './entities/JudgeCreationPanel';
import { TemplateCreationPanel } from './entities/TemplateCreationPanel';

export interface EntityCreationPanelProps extends BasePanelProps {
  // Base props for all entity creation panels
  entityType?: string;
}

interface PanelState {
  isLoading: boolean;
  error: string | null;
  isDirty: boolean;
  isValid: boolean;
}

export const EntityCreationPanel: React.FC<EntityCreationPanelProps> = ({
  panelId,
  context,
  onResult,
  onClose,
}) => {
  const [state, setState] = useState<PanelState>({
    isLoading: false,
    error: null,
    isDirty: false,
    isValid: false,
  });

  // Stabilize updateState function to prevent child re-renders
  const updateState = useCallback((updates: Partial<PanelState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleSave = async (action: 'save' | 'save_and_continue' | 'save_and_close') => {
    updateState({ isLoading: true, error: null });

    try {
      // Check if specific entity panel has a save handler
      const entitySaveHandler = (window as unknown as Window & { [key: string]: unknown })[
        `handleSave_${panelId}`
      ] as ((action: string) => void) | undefined;
      if (entitySaveHandler) {
        entitySaveHandler(action);
      } else {
        // Fallback result
        const result: EntityCreationResult = {
          success: false,
          action,
          error: 'No save handler found for this panel type',
        };
        onResult(result);
      }
    } catch (error) {
      updateState({
        error: error instanceof Error ? error.message : 'An error occurred',
        isLoading: false,
      });
    }
  };

  const handleCancel = () => {
    if (state.isDirty) {
      // Could show confirmation dialog here
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel?'
      );
      if (!confirmed) return;
    }

    onResult({ success: false, action: 'cancel' });
  };

  // Render specific entity panel based on type
  const renderEntityPanel = () => {
    const commonProps = {
      panelId,
      context,
      onResult,
      onClose,
      onStateChange: updateState,
    };

    switch (context.entityType) {
      case 'club':
        return <ClubCreationPanel {...commonProps} />;
      case 'person':
        return <UserCreationPanel {...commonProps} showActions={false} />;
      case 'judge':
        return <JudgeCreationPanel {...commonProps} />;
      case 'template':
        return <TemplateCreationPanel {...commonProps} />;
      default:
        return (
          <div className="p-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Panel type "{context.entityType}" is not yet implemented.
              </AlertDescription>
            </Alert>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Error Banner */}
      {state.error && (
        <div className="p-4 border-b border-destructive/20 bg-destructive/5">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Entity-specific content */}
      <div className="flex-1 overflow-auto">{renderEntityPanel()}</div>

      {/* Action Footer */}
      <div className="flex-shrink-0 border-t bg-muted/5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {state.isLoading && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            )}
            {state.isValid && !state.isLoading && (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>Ready to save</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleCancel} disabled={state.isLoading}>
              Cancel
            </Button>

            {context.mode === 'create' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSave('save')}
                  disabled={!state.isValid || state.isLoading}
                >
                  Save Draft
                </Button>
                <Button
                  onClick={() => handleSave('save_and_close')}
                  disabled={!state.isValid || state.isLoading}
                >
                  {state.isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save & Close'
                  )}
                </Button>
              </>
            )}

            {context.mode === 'edit' && (
              <Button
                onClick={() => handleSave('save_and_close')}
                disabled={!state.isValid || state.isLoading}
              >
                {state.isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  'Update & Close'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntityCreationPanel;
