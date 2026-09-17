/**
 * MYK9-632: the exhibitor's two ways out of a class, told honestly.
 *
 * Replaces `PullConfirmDialog`, which was titled "Pull from class?", said in its
 * body "Are you sure you want to withdraw…", promised "the entry fee will not be
 * refunded", and then wrote `entry_status = 'withdrawn'` — three different
 * stories about one click, on the money path.
 *
 * INTENT: an exhibitor is never asked to guess which word the app means. The
 * chooser states what each act IS and what it does to the fee before anything is
 * clicked, and no screen here says "pull" in one place and "withdraw" in
 * another. A withdrawal reason is picked from THIS registry's list, never typed.
 *
 * Presentational and self-contained: the caller owns the write. Three steps in
 * one dialog (choose → reason, for a withdrawal → confirm) so the exhibitor can
 * back out at any point without the card underneath changing.
 */
import { useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { getWithdrawalPolicy, isPastWithdrawalCutoff } from '@/features/registries';
import type { RegistryId, RemoveFromClassKind, WithdrawalReasonCode } from '@/features/registries';

export interface RemoveFromClassDialogProps {
  open: boolean;
  /** The class the exhibitor is leaving. */
  className: string | null;
  registryId: RegistryId;
  isSaving: boolean;
  /**
   * Why Withdraw cannot be offered for this row right now (a paid entry, a
   * checked-in dog). `null` when it can. Pull has its own.
   */
  withdrawDisabledReason?: string | null;
  pullDisabledReason?: string | null;
  /**
   * When the exhibitor's first class of the day starts, for the registry cutoff.
   * `null`/omitted = not known, and the cutoff is then NOT applied — see
   * `isPastWithdrawalCutoff`, which fails open on purpose.
   */
  firstClassStartsAt?: Date | string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (choice: { kind: RemoveFromClassKind; reason: WithdrawalReasonCode | null }) => void;
}

type Step = 'choose' | 'reason' | 'confirm';

export function RemoveFromClassDialog({
  open,
  className,
  registryId,
  isSaving,
  withdrawDisabledReason = null,
  pullDisabledReason = null,
  firstClassStartsAt = null,
  onOpenChange,
  onConfirm,
}: RemoveFromClassDialogProps) {
  const policy = getWithdrawalPolicy(registryId);
  const [step, setStep] = useState<Step>('choose');
  const [kind, setKind] = useState<RemoveFromClassKind>('pull');
  const [reason, setReason] = useState<WithdrawalReasonCode | null>(null);

  // Every open starts at the chooser. Carrying a half-made choice across opens
  // is how an exhibitor confirms the act they picked for a DIFFERENT class.
  useEffect(() => {
    if (open) {
      setStep('choose');
      setKind('pull');
      setReason(null);
    }
  }, [open, className]);

  const pastCutoff = isPastWithdrawalCutoff({ registryId, firstClassStartsAt });
  const withdrawBlockedBecause = pastCutoff ? policy.cutoffNote : withdrawDisabledReason;
  const selectedReason = policy.reasons.find(candidate => candidate.code === reason);

  const chooseWithdraw = () => {
    setKind('withdraw');
    setReason(null);
    setStep('reason');
  };

  const choosePull = () => {
    setKind('pull');
    setReason(null);
    setStep('confirm');
  };

  const pickReason = (code: WithdrawalReasonCode) => {
    setReason(code);
    setStep('confirm');
  };

  const confirm = () => {
    onConfirm({ kind, reason: kind === 'withdraw' ? reason : null });
  };

  const title =
    step === 'choose'
      ? 'Leave this class?'
      : step === 'reason'
        ? 'Why are you withdrawing?'
        : kind === 'withdraw'
          ? 'Withdraw from this class?'
          : 'Pull from this class?';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {step === 'choose' ? (
              <>
                <strong>{className}</strong> — withdrawing and pulling are different, and the club
                handles the fee differently for each.
              </>
            ) : step === 'reason' ? (
              <>
                {policy.registryId} recognises{' '}
                {policy.reasons.length === 1 ? 'one reason' : 'these reasons'} for a withdrawal.
                Anything else is a pull.
              </>
            ) : kind === 'withdraw' ? (
              <>
                You are withdrawing <strong>{className}</strong>
                {selectedReason ? ` because of: ${selectedReason.label}.` : '.'}{' '}
                {selectedReason?.refundNote}
              </>
            ) : (
              <>
                You are pulling <strong>{className}</strong>. {policy.pullRefundNote}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === 'choose' && (
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={Boolean(withdrawBlockedBecause)}
                onClick={chooseWithdraw}
              >
                Withdraw
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                For a recognised reason — {policy.reasons.map(entry => entry.label).join(' or ')}.
                Refunded per the premium&apos;s rules.
              </p>
              {withdrawBlockedBecause && (
                <p className="mt-2 text-sm text-muted-foreground">{withdrawBlockedBecause}</p>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={Boolean(pullDisabledReason)}
                onClick={choosePull}
              >
                Pull
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                Any other reason — you have decided not to run. {policy.pullRefundNote}
              </p>
              {pullDisabledReason && (
                <p className="mt-2 text-sm text-muted-foreground">{pullDisabledReason}</p>
              )}
            </div>
          </div>
        )}

        {step === 'reason' && (
          <div className="space-y-3">
            {policy.reasons.map(entry => (
              <div key={entry.code} className="rounded-lg border p-3">
                <Button
                  type="button"
                  variant={reason === entry.code ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => pickReason(entry.code)}
                >
                  {entry.label}
                </Button>
                <p className="mt-2 text-sm text-muted-foreground">{entry.refundNote}</p>
                {entry.documentationNote && (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.documentationNote}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <AlertDialogFooter>
          {step === 'choose' ? (
            <AlertDialogCancel disabled={isSaving}>Keep my entry</AlertDialogCancel>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                onClick={() =>
                  setStep(step === 'confirm' && kind === 'withdraw' ? 'reason' : 'choose')
                }
              >
                Back
              </Button>
              <AlertDialogCancel disabled={isSaving}>Keep my entry</AlertDialogCancel>
            </>
          )}
          {step === 'confirm' && (
            <AlertDialogAction
              onClick={confirm}
              disabled={isSaving || (kind === 'withdraw' && reason === null)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {kind === 'withdraw' ? 'Withdrawing...' : 'Pulling...'}
                </>
              ) : kind === 'withdraw' ? (
                'Withdraw entry'
              ) : (
                'Pull entry'
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
