import { useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { logger } from '@/utils/logger';
import { useHeldRingsideScores } from './useHeldRingsideScores';
import { badgeClass } from './slots/atShowChrome.helpers';

const scoresPhrase = (count: number): string => `${count} ${count === 1 ? 'score' : 'scores'}`;

/**
 * Asks before this passcode session takes over scores an earlier session on the
 * device left queued (MYK9-1205). INTENT: calm and optional. The scores are safe
 * either way; the copy never alarms and "Not now" always works.
 */
export function HeldRingsideScoresDialog({
  open,
  count,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload earlier scores?"
      description={`${scoresPhrase(count)} from an earlier session on this device. Upload them now?`}
      confirmLabel="Upload them"
      cancelLabel="Not now"
      onConfirm={onConfirm}
    />
  );
}

/**
 * Explains the count that would otherwise read as an unexplained "waiting to
 * sync": these scores belong to an earlier session, so they cannot upload until
 * the judge says so. Renders nothing when there are none.
 */
export function HeldRingsideScoresBanner({ className }: { className?: string }) {
  const { count, adopt } = useHeldRingsideScores();
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div
      role="status"
      data-testid="held-ringside-scores-banner"
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${badgeClass('warning')} ${className ?? ''}`}
    >
      <CloudUpload size={16} className="shrink-0" aria-hidden />
      <span className="flex-1">
        {scoresPhrase(count)} from an earlier session on this device can&apos;t upload yet. They are
        saved here.
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        onClick={() => setOpen(true)}
      >
        Review
      </Button>
      <HeldRingsideScoresDialog
        open={open}
        count={count}
        onOpenChange={setOpen}
        onConfirm={() => {
          void adopt().catch(error =>
            logger.error('[at-show] adopting held scores failed', 'at-show', {
              error: String(error),
            })
          );
        }}
      />
    </div>
  );
}
