import { Button } from '../../ui/button';
import { CheckCircle } from 'lucide-react';
import { SavedDraft, DraftMetadata } from '../../../hooks/useDraftPersistence';
import { notifications } from '@/lib/notifications';

interface DraftManagerProps {
  loadDraft: (draftId: string) => SavedDraft | null;
  /** Start over: discards a saved entry so it stops prompting on every visit. */
  deleteDraft: (draftId: string) => void;
  availableDrafts: DraftMetadata[];
  hasUnsavedChanges: boolean;
  onDraftLoaded?: (draft: SavedDraft) => boolean | void;
  showResume?: boolean;
  dogsReady?: boolean;
  loadError?: boolean;
  loadingDogs?: boolean;
  /** The signed-in person has not resolved yet, so no roster request is even in flight. */
  identityPending?: boolean;
  onRetryDogs?: () => void;
}

export function DraftManager({
  loadDraft,
  deleteDraft,
  availableDrafts,
  hasUnsavedChanges,
  onDraftLoaded,
  showResume = false,
  dogsReady = true,
  loadError = false,
  loadingDogs = false,
  identityPending = false,
  onRetryDogs,
}: DraftManagerProps) {
  const latestEntryDraft = showResume
    ? availableDrafts.find(draft => (draft.selectedDogsCount ?? 0) > 0 && !draft.completed)
    : undefined;
  // Retrying is only meaningful once we know WHO to load dogs for. Without a
  // resolved person there is no roster request to retry, so the panel waits
  // instead of offering a button that would fire an identity-less read.
  const retryDogs = !identityPending && (loadError || (!dogsReady && !loadingDogs));

  const handleLoadDraft = (draftId: string) => {
    const draft = loadDraft(draftId);
    if (draft) {
      onDraftLoaded?.(draft);
      return;
    }
    // Same silent-failure shape on the way back in: a corrupt or evicted
    // payload returned null with no explanation.
    notifications.error(
      'We could not open that draft — it may have been cleared by this browser. Start the entry again, or pick a different draft.'
    );
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-3">
      {/* Save Status Indicator */}
      <DraftIndicator hasUnsavedChanges={!!hasUnsavedChanges} />

      {latestEntryDraft && (
        <section className="flex w-full flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Continue your entry?</h3>
            <p className="text-sm text-muted-foreground">
              {loadError
                ? 'Your entry is saved here, but your dogs could not be loaded. Reconnect and try again.'
                : dogsReady
                  ? 'Your previous selection is saved on this device. Resume it or select a dog below to start a different entry.'
                  : loadingDogs
                    ? 'Your entry is saved here. Waiting for your dogs to load.'
                    : identityPending
                      ? 'Your entry is saved here. Waiting for your account to finish loading.'
                      : 'Your entry is saved here. Reconnect and try loading your dogs.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => deleteDraft(latestEntryDraft.id)}
            >
              Start over
            </Button>
            <Button
              className="min-h-11 shrink-0"
              onClick={retryDogs ? onRetryDogs : () => handleLoadDraft(latestEntryDraft.id)}
              disabled={retryDogs ? !onRetryDogs : !dogsReady}
            >
              {retryDogs ? 'Retry loading dogs' : 'Resume entry'}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

interface DraftIndicatorProps {
  hasUnsavedChanges: boolean;
}

/**
 * Simple indicator component showing draft status
 */
export function DraftIndicator({ hasUnsavedChanges }: DraftIndicatorProps) {
  if (!hasUnsavedChanges) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle className="h-3 w-3 text-green-500" />
        <span>Saved</span>
      </div>
    );
  }

  return null;
}
