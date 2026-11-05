import { useMemo, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWithdrawalRefundPreviews } from '@/features/payments/useWithdrawalRefundPreview';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { ENTRY_VERB_HELP } from './entryVerbHelp';
import { isStripeRefundable } from './refundEligibility';
import {
  entryFeeCents,
  everyOutcomeKnown,
  resolveWithdrawRefundOutcome,
} from './withdrawRefundOutcome';
import { resolveDogBulkEligibility, type DogBulkVerb } from './dogBulkStatusEligibility';
import { runDogBulkStatus, type DogStatusChange } from './dogBulkStatusRun';
import { ExcludedEntries, WithdrawPreview } from './DogBulkStatusPreview';
import { WithdrawalReasonDialog } from './WithdrawalReasonDialog';

interface DogBulkStatusMenuProps {
  dogName: string;
  entries: EntryManagementEntry[];
  onStatusChange: DogStatusChange;
}

/**
 * MYK9-1688: the dog-level menu on the entry form. "Pull <dog> from all entries" and
 * "Withdraw <dog>…" run the existing per-entry status path over every eligible entry of the dog
 * after one confirm. It adds no mutation and never issues a refund.
 */
export function DogBulkStatusMenu({ dogName, entries, onStatusChange }: DogBulkStatusMenuProps) {
  const [dialog, setDialog] = useState<DogBulkVerb | null>(null);
  const [running, setRunning] = useState(false);
  const pull = useMemo(() => resolveDogBulkEligibility(entries, 'pull'), [entries]);
  const withdraw = useMemo(() => resolveDogBulkEligibility(entries, 'withdraw'), [entries]);

  // MYK9-1615: every eligible entry's refund is read before Withdraw may confirm. A failed read
  // blocks it until a retry succeeds or the secretary chooses to set those refunds at approval.
  const [refundsAtApproval, setRefundsAtApproval] = useState(false);
  const previews = useWithdrawalRefundPreviews(
    withdraw.eligible.map(entry => ({
      entryId: entry.id,
      entryFeeCents: entryFeeCents(entry),
      enabled: dialog === 'withdraw' && isStripeRefundable(entry),
    }))
  );
  const outcomes = withdraw.eligible.map((entry, i) =>
    resolveWithdrawRefundOutcome(entry, previews[i], refundsAtApproval)
  );
  const withdrawBlockedReason = everyOutcomeKnown(outcomes)
    ? null
    : outcomes.some(o => o.kind === 'failed')
      ? 'Try the refund policy again, or choose to set refunds when approving.'
      : 'Waiting for the refund policy check.';
  const retryPreviews = () => {
    for (const preview of previews) if (preview.isError) void preview.refetch();
  };

  const close = () => {
    setDialog(null);
    setRefundsAtApproval(false);
  };
  const run = async (verb: DogBulkVerb, withdrawalReason?: string) => {
    const targets = (verb === 'pull' ? pull : withdraw).eligible;
    close();
    setRunning(true);
    try {
      await runDogBulkStatus({
        verb,
        dogName,
        entries: targets,
        onStatusChange,
        ...(withdrawalReason !== undefined ? { withdrawalReason } : {}),
      });
    } finally {
      setRunning(false);
    }
  };

  const items: Array<{ verb: DogBulkVerb; label: string; eligible: number }> = [
    { verb: 'pull', label: `Pull ${dogName} from all entries`, eligible: pull.eligible.length },
    { verb: 'withdraw', label: `Withdraw ${dogName}…`, eligible: withdraw.eligible.length },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            disabled={running}
            aria-label={`Actions for ${dogName}, all entries`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {items.map(({ verb, label, eligible }) => (
            <DropdownMenuItem
              key={verb}
              className="min-h-11 flex-col items-start"
              disabled={eligible === 0}
              onClick={() => setDialog(verb)}
            >
              <span>{label}</span>
              <span className="text-xs text-muted-foreground">
                {eligible === 0
                  ? `No entries for ${dogName} can be ${verb === 'pull' ? 'pulled' : 'withdrawn'}: already run, moved or finished.`
                  : verb === 'pull'
                    ? ENTRY_VERB_HELP.pull
                    : ENTRY_VERB_HELP.withdraw}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={dialog === 'pull'} onOpenChange={open => !open && close()}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Pull {dogName} from {pull.eligible.length}{' '}
              {pull.eligible.length === 1 ? 'entry' : 'entries'}?
            </AlertDialogTitle>
            <AlertDialogDescription>{ENTRY_VERB_HELP.pull}</AlertDialogDescription>
          </AlertDialogHeader>
          <ExcludedEntries excluded={pull.excluded} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run('pull')}>Pull {dogName}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WithdrawalReasonDialog
        open={dialog === 'withdraw'}
        onOpenChange={open => !open && close()}
        onConfirm={reason => void run('withdraw', reason)}
        title={`Withdraw ${dogName}`}
        confirmLabel={`Withdraw ${dogName}`}
        confirmBlockedReason={withdrawBlockedReason}
      >
        {dialog === 'withdraw' && (
          <WithdrawPreview
            dogName={dogName}
            eligibility={withdraw}
            outcomes={outcomes}
            onRetry={retryPreviews}
            onRefundsAtApproval={() => setRefundsAtApproval(true)}
          />
        )}
      </WithdrawalReasonDialog>
    </>
  );
}
