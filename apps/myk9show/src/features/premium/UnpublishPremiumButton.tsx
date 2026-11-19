import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { notifications } from '@/lib/notifications';
import { OWN_PREMIUM_REMOVE_FAILED, unpublishPremium, useRefreshPremiumState } from './ownPremium';

/**
 * What the confirmation says about the entries: they are not affected. The count is the
 * secretary's own, so "3 entries have been made. They are not affected." (plan-premium-completeness).
 */
export function unpublishEntriesLine(entryCount: number | null | undefined): string {
  if (!entryCount) return 'No entries are affected.';
  const made = entryCount === 1 ? '1 entry has' : `${entryCount} entries have`;
  return `${made} been made. ${entryCount === 1 ? 'It is' : 'They are'} not affected.`;
}

interface UnpublishPremiumButtonProps {
  showId: string;
  entryCount?: number | null | undefined;
  disabled?: boolean;
}

export function UnpublishPremiumButton({
  showId,
  entryCount,
  disabled = false,
}: UnpublishPremiumButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshPremiumState(showId);

  const confirm = async () => {
    setBusy(true);
    try {
      await unpublishPremium(showId);
      await refresh();
      notifications.success('Premium list unpublished');
    } catch {
      notifications.error(OWN_PREMIUM_REMOVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="touch"
        variant="outline"
        className="shrink-0 whitespace-nowrap"
        disabled={disabled || busy}
        onClick={() => setOpen(true)}
      >
        Unpublish
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Unpublish the premium list?"
        description={
          <>
            This removes the premium list download and the public announcement for this show.{' '}
            {unpublishEntriesLine(entryCount)} You can publish again any time.
          </>
        }
        confirmLabel="Unpublish"
        destructive
        onConfirm={() => void confirm()}
      />
    </>
  );
}
