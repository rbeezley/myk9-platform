import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { sendLifecycleEmailJobs, type EntryDecisionEmailStatus } from './api';
import { decisionEmailContext, type DecisionStepType } from './decisionEmail';
import { buildLifecycleEmailDraft } from './render';
import { saveDecisionEmailJob } from './saveDecisionEmailJob';

const EMAIL_NAME: Record<DecisionStepType, { lower: string; title: string }> = {
  accepted: { lower: 'acceptance', title: 'Acceptance' },
  waitlisted: { lower: 'waitlist', title: 'Waitlist' },
};

interface SendDecisionEmailArgs {
  /** What each entry's decision emails already are: ready, failed or sent. */
  statusMap: Record<string, EntryDecisionEmailStatus>;
  showName: string | undefined;
  /** A send was attempted: the entry's email status may have changed. */
  onSettled: () => void;
}

/** An email for this very decision is already on the entry: waiting, failed or sent. */
function alreadyHasEmail(
  status: EntryDecisionEmailStatus | undefined,
  stepType: DecisionStepType
): boolean {
  return [status?.readyJob, status?.failedJob, status?.sentDecisionJob].some(
    job => job?.stepType === stepType && !job.correctionForJobId
  );
}

/**
 * Sends an entry's acceptance or waitlist email with no preview (owner decision 2026-11-09,
 * MYK9-1800). The caller invokes it once the decision has STOOD: the status change's Undo
 * toast has closed without Undo and the entry still has that status. It is handed the live
 * entry, so the email carries the armband the Accept itself assigned.
 *
 * It says nothing when there is nothing to do, and never opens a dialog:
 *  - no email on file: one plain notice, no job (a job with no recipient can only fail);
 *  - an email for this decision is already on the entry: silence. She was told, or the
 *    entry already shows it waiting. Saving again would only hit the idempotency key.
 *  - offline, or the email could not be saved: a notice that stays, with one button to send.
 *    Nothing is saved yet in that case, so the notice is the only handle on it.
 *  - saved but not delivered: it is on the entry to send again.
 *
 * The returned function is stable and safe to call after the cockpit has unmounted (she
 * switched view inside the window): it touches only refs, the API and the toaster.
 */
export function useSendDecisionEmail({
  statusMap,
  showName,
  onSettled,
}: SendDecisionEmailArgs): (entry: EntryManagementEntry, stepType: DecisionStepType) => void {
  const latest = useRef({ statusMap, showName, onSettled });
  useEffect(() => {
    latest.current = { statusMap, showName, onSettled };
  });

  return useCallback((entry: EntryManagementEntry, stepType: DecisionStepType) => {
    const { lower: emailName, title: emailTitle } = EMAIL_NAME[stepType];
    const ownerName = entry.ownerName?.trim();
    const who = ownerName || 'the exhibitor';
    const toastId = `decision-email:${entry.id}`;

    if (!entry.ownerEmail?.trim()) {
      toast.info(
        `${ownerName || 'The exhibitor'} has no email on file, so no ${emailName} email was sent.`
      );
      return;
    }

    const send = async () => {
      const { statusMap: statuses, showName: name, onSettled: settled } = latest.current;
      if (alreadyHasEmail(statuses[entry.id], stepType)) return;

      const waiting = (message: string, button: string, tone: 'info' | 'error') =>
        toast[tone](message, {
          id: toastId,
          duration: Infinity,
          action: { label: button, onClick: () => void send() },
        });

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        waiting(
          `You're offline, so the ${emailName} email to ${who} has not gone yet.`,
          'Send now',
          'info'
        );
        return;
      }

      const draft = buildLifecycleEmailDraft({ stepType, ...decisionEmailContext(entry, name) });
      let jobId: string | null;
      try {
        jobId = await saveDecisionEmailJob(entry, stepType, { ...draft, secretaryNote: '' });
        if (!jobId) throw new Error('Lifecycle email job was not created');
      } catch {
        waiting(`The ${emailName} email to ${who} could not be sent.`, 'Try again', 'error');
        return;
      }

      try {
        const result = await sendLifecycleEmailJobs({
          supabase,
          showId: entry.showId,
          jobIds: [jobId],
        });
        // The send handler answers 200 even when delivery fails; the job stays on the entry.
        if (result.failed > 0) throw new Error('Lifecycle email delivery failed');
        toast.success(`${emailTitle} email sent to ${who}`, { id: toastId });
      } catch {
        toast.error(
          `The ${emailName} email to ${who} did not send. It is on the entry for you to send again.`,
          { id: toastId }
        );
      } finally {
        settled();
      }
    };

    void send();
  }, []);
}
