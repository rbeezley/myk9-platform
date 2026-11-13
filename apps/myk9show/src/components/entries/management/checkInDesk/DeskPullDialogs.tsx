import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { PullAtShowDialog } from './PullAtShowDialog';
import type { useDeskPull } from './useDeskPull';

/** The confirmations behind `useDeskPull`: Pull (asks for a reason) and putting a Pull back. */
export function DeskPullDialogs({ pull }: { pull: ReturnType<typeof useDeskPull> }) {
  return (
    <>
      {pull.pullRow && (
        <PullAtShowDialog
          open
          dogName={pull.pullRow.dogName}
          armband={pull.pullRow.armband}
          className={pull.pullRow.className}
          isSubmitting={pull.isWorking}
          onOpenChange={open => {
            if (!open) pull.cancel();
          }}
          onConfirm={reason => void pull.confirmPull(reason)}
        />
      )}
      {pull.unpullRow && (
        <ConfirmDialog
          open
          onOpenChange={open => {
            if (!open) pull.cancel();
          }}
          title={`Put ${pull.unpullRow.dogName} back in ${pull.unpullRow.className}?`}
          description={`The pull is undone, ${pull.unpullRow.dogName} is entered again, and the check-in goes back to what it was before the pull.`}
          confirmLabel="Put back"
          onConfirm={() => void pull.confirmUnpull()}
        />
      )}
    </>
  );
}
