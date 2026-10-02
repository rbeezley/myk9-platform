/**
 * What the delete dialog shows. Pure: every fact arrives as a prop, so each of
 * the three states (unknown, blocked, allowed) can be rendered and tested on
 * its own. `DeleteObjectDialog` connects it to the preview and the delete.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  blockedActionLabel,
  blockedReason,
  bulkBlockedReason,
  alreadyDeletedNotice,
  bulkNameList,
  cascadeSentence,
  deleteButtonLabel,
  deleteTitle,
  DELETING_LABEL,
  KEEP_LABEL,
  undoSentence,
  unknownReason,
  unsavedWorkNotice,
  UNSAVED_WORK_CHECK_FAILED,
} from './deleteObjectCopy';
import type { UnsavedWorkState } from './useUnsavedWork';
import {
  deleteGateOf,
  type DeleteObjectKind,
  type DeletePreview,
  type DeletePreviewState,
  type DeleteTarget,
} from './deleteTypes';

export interface DeleteBlockedAction {
  to: string;
}

export interface DeleteObjectDialogViewProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  kind: DeleteObjectKind;
  targets: readonly DeleteTarget[];
  previewState: DeletePreviewState;
  /** Items the server says are already deleted: named, not counted, never blocking. */
  alreadyGoneTargets?: readonly DeleteTarget[] | undefined;
  /** Per-target previews (same order as `targets`), to name blocked items in a bulk delete. */
  perItem?: readonly (DeletePreview | undefined)[] | undefined;
  onRetry?: (() => void) | undefined;
  isDeleting?: boolean | undefined;
  errorMessage?: string | null | undefined;
  blockedAction?: DeleteBlockedAction | undefined;
  /**
   * A site-admin override control (today: the dog force-delete opt-in). Shown
   * only when the delete is blocked; `overrideArmed` unlocks Delete.
   */
  overrideControl?: React.ReactNode;
  overrideArmed?: boolean | undefined;
  /**
   * Changes on this device that have not uploaded. While anything is unsaved (or
   * not yet known) Delete is off, whatever the counts say.
   */
  unsavedWork?: UnsavedWorkState | undefined;
  onRecheckUnsaved?: (() => void) | undefined;
}

// A destructive OUTLINE, not solid red: Delete sits next to Keep it, and the
// solid red pair read as two equally loud choices.
const DELETE_BUTTON_CLASS =
  'min-w-28 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive';

/** The "still saving" / "could not check" notice that keeps Delete off. */
function UnsavedWorkNotice({
  unsavedWork,
  onRecheck,
}: {
  unsavedWork: UnsavedWorkState;
  onRecheck: (() => void) | undefined;
}) {
  if (unsavedWork.status !== 'unsaved' && unsavedWork.status !== 'error') return null;
  return (
    <div
      className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2"
      data-testid="delete-unsaved-work"
    >
      <p className="text-sm font-medium text-foreground" role="status">
        {unsavedWork.status === 'unsaved'
          ? unsavedWorkNotice(unsavedWork.total, unsavedWork.failed)
          : UNSAVED_WORK_CHECK_FAILED}
      </p>
      {onRecheck && (
        <Button type="button" variant="outline" size="touch" onClick={onRecheck}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Check again
        </Button>
      )}
    </div>
  );
}

/** The counts are not known yet (checking) or could not be read (offline, failed). */
function PreviewUnknown({
  kind,
  count,
  previewState,
  onRetry,
}: {
  kind: DeleteObjectKind;
  count: number;
  previewState: DeletePreviewState;
  onRetry: (() => void) | undefined;
}) {
  if (previewState.status === 'pending') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {unknownReason(kind, 'pending', count)}
      </p>
    );
  }
  if (previewState.status !== 'unavailable') return null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground" role="status">
        {unknownReason(kind, previewState.reason, count)}
      </p>
      {previewState.reason === 'failed' && onRetry && (
        <Button
          type="button"
          variant="outline"
          size="touch"
          loading={previewState.isRetrying}
          onClick={onRetry}
        >
          {!previewState.isRetrying && <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
          Try again
        </Button>
      )}
    </div>
  );
}

export function DeleteObjectDialogView({
  open,
  onCancel,
  onConfirm,
  kind,
  targets,
  previewState,
  perItem,
  alreadyGoneTargets = [],
  onRetry,
  isDeleting = false,
  errorMessage,
  blockedAction,
  overrideControl,
  overrideArmed = false,
  unsavedWork = { status: 'clean' },
  onRecheckUnsaved,
}: DeleteObjectDialogViewProps) {
  const count = targets.length;
  const gate = deleteGateOf(previewState);
  const single = count === 1 ? targets[0] : undefined;
  const canOverride = gate === 'blocked' && overrideControl !== undefined;
  const deleteDisabled =
    isDeleting ||
    unsavedWork.status !== 'clean' ||
    gate === 'unknown' ||
    (gate === 'blocked' && !(canOverride && overrideArmed));

  const blockedTargets =
    gate === 'blocked' && count > 1
      ? targets.filter((_, index) => (perItem?.[index]?.blocking ?? 0) > 0)
      : [];
  const actionLabel = blockedActionLabel(kind);

  return (
    // The repo's AlertDialog primitive (Base UI): focus stays inside, the page
    // behind is inert, focus returns to what opened it. The in-flight latch is
    // the same as before: a delete in flight cannot be dismissed out from under
    // itself (Escape included).
    <AlertDialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen && !isDeleting) onCancel();
      }}
    >
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3 text-xl">
            <span className="text-destructive">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </span>
            {deleteTitle(kind, targets)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {single ? single.detail : bulkNameList(targets)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3" data-testid="delete-object-body" data-gate={gate}>
          <UnsavedWorkNotice unsavedWork={unsavedWork} onRecheck={onRecheckUnsaved} />

          <PreviewUnknown kind={kind} count={count} previewState={previewState} onRetry={onRetry} />

          {previewState.status === 'ready' && (
            <>
              {gate === 'blocked' && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <p
                    className="text-sm font-medium text-foreground"
                    data-testid="delete-blocked-reason"
                  >
                    {count === 1
                      ? blockedReason(kind, previewState.preview)
                      : bulkBlockedReason(
                          kind,
                          blockedTargets.length > 0 ? blockedTargets : targets
                        )}
                  </p>
                  {blockedAction && actionLabel && (
                    <Link
                      to={blockedAction.to}
                      onClick={() => {
                        // The link may point at the page already open, so the route
                        // never changes and nothing else would close this dialog.
                        onCancel();
                      }}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
                    >
                      {actionLabel}
                    </Link>
                  )}
                </div>
              )}
              {(() => {
                const sentence = cascadeSentence(kind, previewState.preview, count);
                return sentence ? <p className="text-sm text-foreground">{sentence}</p> : null;
              })()}
              <p className="text-sm text-muted-foreground">{undoSentence(count)}</p>
              {canOverride && overrideControl}
            </>
          )}

          {alreadyGoneTargets.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="delete-already-gone">
              {alreadyDeletedNotice(alreadyGoneTargets)}
            </p>
          )}

          {errorMessage && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errorMessage}
            </p>
          )}
        </div>
        <AlertDialogFooter className="flex flex-wrap justify-end gap-3 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={onCancel}
            disabled={isDeleting}
          >
            {KEEP_LABEL}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            className={DELETE_BUTTON_CLASS}
            onClick={onConfirm}
            disabled={deleteDisabled}
          >
            {isDeleting ? DELETING_LABEL : deleteButtonLabel(kind, count)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
