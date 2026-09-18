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
import { useState } from 'react';
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
import { getWithdrawalPolicy } from '@/features/registries';
import type { RemoveFromClassKind, WithdrawalReasonCode } from '@/features/registries';
import { registryResolutionKey, type ShowRegistryResolution } from './useShowRegistryId';

/**
 * Said while the show's rulebook is still being looked up. Withdraw is closed
 * rather than guessed: the reasons ARE the rulebook, and offering AKC's list to
 * an ASCA exhibitor invites them to record a reason their registry does not have.
 */
const RESOLVING_NOTE = "Checking the show's rules…";
const UNAVAILABLE_NOTE = "Can't confirm the show's rules right now — Pull is still available";

/**
 * Pull's refund sentence is the same on every configured registry, so it does
 * not need the rulebook — which is what lets Pull stay available while the
 * lookup is in flight or has failed.
 */
const PULL_REFUND_FALLBACK = "Refunds for a pull are at the club's discretion.";

export interface RemoveFromClassDialogProps {
  open: boolean;
  /** The class row's `entries.id`. Identity for the chooser's state, not display. */
  classId: string | null;
  /** The class the exhibitor is leaving. */
  className: string | null;
  /**
   * The show's rulebook, or the fact that we do not know it yet. Not a
   * RegistryId: "still looking" and "this is an AKC show" must not be the same
   * value (MYK9-632 round 4).
   */
  registry: ShowRegistryResolution;
  isSaving: boolean;
  /**
   * Why Withdraw cannot be offered for this row right now (a paid entry, a
   * checked-in dog). `null` when it can. Pull has its own.
   */
  withdrawDisabledReason?: string | null;
  pullDisabledReason?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (choice: { kind: RemoveFromClassKind; reason: WithdrawalReasonCode | null }) => void;
}

type Step = 'choose' | 'reason' | 'confirm';

export function RemoveFromClassDialog({ open, onOpenChange, ...rest }: RemoveFromClassDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {/* Keyed on the class ID, and unmounted while closed, so the half-made
            choice can never be carried into a DIFFERENT class's dialog. The ID,
            not the name: two classes in one show can share a display name
            ("Container Novice A" in two trials), and a name-keyed chooser would
            hand the second one the first one's half-made choice. That is a
            remount, not a reset-in-an-effect (LESSONS: no setState in an effect
            body). */}
        {/* The key carries the RULEBOOK as well as the class. A reason is only
            meaningful under the registry it was offered by, so when the lookup
            lands (or fails) after the exhibitor has already picked one, the
            selection is discarded with the answer it belonged to instead of
            being carried into a rulebook that may not recognise it. */}
        <RemoveFromClassBody
          key={`${rest.classId ?? ''}|${registryResolutionKey(rest.registry)}`}
          {...rest}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

type RemoveFromClassBodyProps = Omit<RemoveFromClassDialogProps, 'open' | 'onOpenChange'>;

function RemoveFromClassBody({
  className,
  registry,
  isSaving,
  withdrawDisabledReason = null,
  pullDisabledReason = null,
  onConfirm,
}: RemoveFromClassBodyProps) {
  const policy = registry.status === 'resolved' ? getWithdrawalPolicy(registry.registry) : null;
  const [step, setStep] = useState<Step>('choose');
  const [kind, setKind] = useState<RemoveFromClassKind>('pull');
  const [reason, setReason] = useState<WithdrawalReasonCode | null>(null);

  // Withdraw needs the rulebook; Pull never does. Its own eligibility refusal
  // still wins, because that one is about THIS entry rather than the show.
  const withdrawBlockedBecause =
    withdrawDisabledReason ??
    (registry.status === 'resolving'
      ? RESOLVING_NOTE
      : registry.status === 'unavailable'
        ? UNAVAILABLE_NOTE
        : null);

  const selectedReason = policy?.reasons.find(candidate => candidate.code === reason);
  // A withdrawal is never confirmable without a reason THIS registry offers.
  // Derived, not reset in an effect: if the answer changed under us the
  // exhibitor lands back on the reason list for the rulebook now in force,
  // rather than on a confirm step whose sentence has quietly lost its clause.
  const effectiveStep: Step =
    step === 'confirm' && kind === 'withdraw' && !selectedReason ? 'reason' : step;

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
    // Belt and braces: the action is disabled in this state, but a withdrawal
    // with no reason must never leave this component even if something else
    // manages to click it.
    if (kind === 'withdraw' && !selectedReason) return;
    onConfirm({ kind, reason: kind === 'withdraw' ? (selectedReason?.code ?? null) : null });
  };

  const title =
    effectiveStep === 'choose'
      ? 'Leave this class?'
      : effectiveStep === 'reason'
        ? 'Why are you withdrawing?'
        : kind === 'withdraw'
          ? 'Withdraw from this class?'
          : 'Pull from this class?';

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {effectiveStep === 'choose' ? (
            <>
              <strong>{className}</strong> — withdrawing and pulling are different, and the club
              handles the fee differently for each.
            </>
          ) : effectiveStep === 'reason' ? (
            <>
              {policy?.registryId} recognises{' '}
              {policy?.reasons.length === 1 ? 'one reason' : 'these reasons'} for a withdrawal.
              Anything else is a pull.
            </>
          ) : kind === 'withdraw' ? (
            <>
              {/* `effectiveStep` guarantees a selected reason here, so the
                  sentence can never quietly lose its clause. */}
              You are withdrawing <strong>{className}</strong> because of: {selectedReason?.label}.
              Your withdrawal is recorded. The show secretary confirms the refund under the
              premium&apos;s rules.
            </>
          ) : (
            <>
              You are pulling <strong>{className}</strong>. {PULL_REFUND_FALLBACK}
            </>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {effectiveStep === 'choose' && (
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
              {policy
                ? `For a recognised reason — ${policy.reasons
                    .map(entry => entry.label)
                    .join(' or ')}. ${policy.withdrawRefundNote}`
                : 'For a reason this show\u2019s registry recognises.'}
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
              Any other reason — you have decided not to run. {PULL_REFUND_FALLBACK}
            </p>
            {pullDisabledReason && (
              <p className="mt-2 text-sm text-muted-foreground">{pullDisabledReason}</p>
            )}
          </div>
        </div>
      )}

      {effectiveStep === 'reason' && policy && (
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
              {entry.documentationNote && (
                <p className="mt-2 text-sm text-muted-foreground">{entry.documentationNote}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialogFooter>
        {effectiveStep === 'choose' ? (
          <AlertDialogCancel disabled={isSaving}>Keep my entry</AlertDialogCancel>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => setStep(effectiveStep === 'reason' ? 'choose' : 'reason')}
            >
              Back
            </Button>
            <AlertDialogCancel disabled={isSaving}>Keep my entry</AlertDialogCancel>
          </>
        )}
        {effectiveStep === 'confirm' && (
          <AlertDialogAction
            onClick={confirm}
            disabled={isSaving || (kind === 'withdraw' && !selectedReason)}
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
    </>
  );
}
