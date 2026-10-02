import type React from 'react';
import { AlertCircle, ArrowRight, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditPanelDeleteButton, type EditPanelDeleteOption } from './EditPanelDelete';
import { EditPanelErrorSummary } from './EditPanelErrorSummary';

interface EditPanelFooterProps {
  errors: string[];
  onDelete?: EditPanelDeleteOption | undefined;
  onOpenDelete: () => void;
  /** Save and Close hold still while a save or the delete dialog is in flight. */
  controlsBlocked: boolean;
  hasChanges: boolean;
  enableAutoSave: boolean;
  footerActions?: React.ReactNode;
  cancelLabel: string;
  onCancel: () => void;
  saveVariant: 'default' | 'outline';
  saveLabel: string;
  saveDisabled: boolean;
  saving: boolean;
  onSave: () => void;
  /** Create-mode tab walk: when set, "Next: <tab>" replaces Save (decision 13). */
  nextTab?: { label: string } | undefined;
  onNext: () => void;
  /** Why Next refused to move on, or null. */
  stepBlockedMessage: string | null;
}

const ACTION_BUTTON_CLASS =
  'min-w-0 flex-1 gap-2 transition-all duration-200 hover:scale-105 active:scale-95 sm:flex-none';

/** The panel footer: errors, Delete, unsaved-changes status, then Cancel and Save/Next. */
export function EditPanelFooter({
  errors,
  onDelete,
  onOpenDelete,
  controlsBlocked,
  hasChanges,
  enableAutoSave,
  footerActions,
  cancelLabel,
  onCancel,
  saveVariant,
  saveLabel,
  saveDisabled,
  saving,
  onSave,
  nextTab,
  onNext,
  stepBlockedMessage,
}: EditPanelFooterProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <EditPanelErrorSummary errors={errors} />
      {stepBlockedMessage && (
        <div
          role="alert"
          data-testid="edit-panel-step-blocked"
          className="flex w-full items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">Finish this step before you continue.</span>{' '}
            {stepBlockedMessage}
          </p>
        </div>
      )}

      <div
        data-testid="edit-panel-action-row"
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2"
      >
        {onDelete && (
          <EditPanelDeleteButton
            option={onDelete}
            disabled={controlsBlocked}
            onOpen={onOpenDelete}
            className="order-last sm:order-none"
          />
        )}
        <div
          data-testid="edit-panel-status-group"
          className="flex min-w-0 flex-1 items-center gap-4"
        >
          {/* Status indicators */}
          {hasChanges && (
            <div
              role="status"
              aria-label="Unsaved changes"
              className="flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in-0 slide-in-from-left-1 duration-200 ease-out"
            >
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
              <span className="hidden sm:inline" aria-hidden>
                Unsaved changes
              </span>
            </div>
          )}

          {enableAutoSave && <div className="text-xs text-muted-foreground">Auto-save enabled</div>}
        </div>

        <div
          data-testid="edit-panel-action-group"
          className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto"
        >
          {footerActions}
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={controlsBlocked}
            className={ACTION_BUTTON_CLASS}
          >
            <X className="h-4 w-4" />
            {cancelLabel}
          </Button>
          {nextTab ? (
            <Button
              type="button"
              variant="default"
              data-variant="default"
              onClick={onNext}
              disabled={controlsBlocked}
              className={ACTION_BUTTON_CLASS}
            >
              Next: {nextTab.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant={saveVariant}
              data-variant={saveVariant}
              onClick={onSave}
              disabled={saveDisabled}
              className={ACTION_BUTTON_CLASS}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : saveLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
