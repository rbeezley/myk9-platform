import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DraftMetadata, SavedDraft } from '@/hooks/useDraftPersistence';
import { notifications } from '@/lib/notifications';

interface DraftResumePromptProps {
  drafts: DraftMetadata[];
  canResume?: boolean;
  loadError?: boolean;
  loadDraft: (id: string) => SavedDraft | null;
  deleteDraft: (id: string) => void;
  onDraftLoaded: (draft: SavedDraft) => boolean | void;
}

export function DraftResumePrompt({
  drafts,
  canResume = true,
  loadError = false,
  loadDraft,
  deleteDraft,
  onDraftLoaded,
}: DraftResumePromptProps) {
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  const latest = drafts.find(
    draft =>
      (draft.selectedDogsCount ?? 0) > 0 && !draft.completed && !rejectedIds.includes(draft.id)
  );
  if (!latest) return null;

  const resume = () => {
    const saved = loadDraft(latest.id);
    if (!saved) {
      deleteDraft(latest.id);
      notifications.error(
        'We could not open that draft on this device. You can select a dog to start again.'
      );
      return;
    }
    if (onDraftLoaded(saved) === false) {
      setRejectedIds(ids => [...ids, latest.id]);
    }
  };

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-semibold text-foreground">Continue your entry?</h3>
        <p className="text-sm text-muted-foreground">
          {loadError
            ? 'Your entry is saved here, but your dogs could not be loaded. Try again when your dogs are available.'
            : canResume
              ? 'Your previous selection is saved on this device. You can resume it or select a dog below to start again.'
              : 'Your entry is saved here. Resume will be available when your dogs finish loading.'}
        </p>
      </div>
      <Button className="min-h-11 shrink-0" onClick={resume} disabled={!canResume}>
        Resume entry
      </Button>
    </section>
  );
}
