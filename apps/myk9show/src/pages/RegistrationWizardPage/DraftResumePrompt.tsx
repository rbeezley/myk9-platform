import { Button } from '@/components/ui/button';
import type { DraftMetadata, SavedDraft } from '@/hooks/useDraftPersistence';
import { notifications } from '@/lib/notifications';

interface DraftResumePromptProps {
  drafts: DraftMetadata[];
  loadDraft: (id: string) => SavedDraft | null;
  deleteDraft: (id: string) => void;
  onDraftLoaded: (draft: SavedDraft) => void;
}

export function DraftResumePrompt({
  drafts,
  loadDraft,
  deleteDraft,
  onDraftLoaded,
}: DraftResumePromptProps) {
  const latest = drafts.find(draft => (draft.selectedDogsCount ?? 0) > 0 && !draft.completed);
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
    onDraftLoaded(saved);
  };

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-semibold text-foreground">Continue your entry?</h3>
        <p className="text-sm text-muted-foreground">
          Your previous selection is saved on this device. You can resume it or select a dog below
          to start again.
        </p>
      </div>
      <Button className="min-h-11 shrink-0" onClick={resume}>
        Resume entry
      </Button>
    </section>
  );
}
