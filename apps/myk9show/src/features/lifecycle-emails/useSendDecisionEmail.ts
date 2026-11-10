import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { LifecycleEmailAlreadySavedError, sendLifecycleEmailJobs } from './api';
import { decisionEmailContext, type DecisionStepType } from './decisionEmail';
import { buildLifecycleEmailDraft } from './render';
import { saveDecisionEmailJob } from './saveDecisionEmailJob';

const EMAIL_NAME: Record<DecisionStepType, { lower: string; title: string }> = {
  accepted: { lower: 'acceptance', title: 'Acceptance' },
  waitlisted: { lower: 'waitlist', title: 'Waitlist' },
};

interface SendDecisionEmailArgs {
  showName: string | undefined;
  /** A send was attempted: the entry's email status may have changed. */
  onSettled: () => void;
}

/**
 * Sends an entry's acceptance or waitlist email with no preview (owner decision 2026-11-09,
 * MYK9-1800). The caller invokes it once the decision has STOOD: the status change's Undo
 * toast has closed without Undo and the entry still has that status. It is handed the live
 * entry, so the email carries the armband the Accept itself assigned.
 *
 * It acts once, at that moment, and keeps nothing to act on later:
 *  - no email on file: one plain notice, no job (a job with no recipient can only fail);
 *  - the server already holds an email for this entry and decision (sent before, or waiting
 *    on the entry as "Email ready"): silence. The server's key is the one rule for "one
 *    email per decision"; this hook does not guess at it from what the page has loaded.
 *  - offline, or the send failed: one notice that names "Email Exhibitor" on the entry, the
 *    button that is always there. No retry button: it would act later on an entry that may
 *    have changed since.
 *
 * The returned function is stable and safe to call after the cockpit has unmounted (she
 * switched view inside the window): it touches only refs, the API and the toaster.
 */
export function useSendDecisionEmail({
  showName,
  onSettled,
}: SendDecisionEmailArgs): (entry: EntryManagementEntry, stepType: DecisionStepType) => void {
  const latest = useRef({ showName, onSettled });
  useEffect(() => {
    latest.current = { showName, onSettled };
  });

  return useCallback((entry: EntryManagementEntry, stepType: DecisionStepType) => {
    const { lower: emailName, title: emailTitle } = EMAIL_NAME[stepType];
    const ownerName = entry.ownerName?.trim();
    const who = ownerName || 'the exhibitor';

    if (!entry.ownerEmail?.trim()) {
      toast.info(
        `${ownerName || 'The exhibitor'} has no email on file, so no ${emailName} email was sent.`
      );
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error(
        `You're offline, so the ${emailName} email to ${who} was not sent. When you are back online, use "Email Exhibitor" on the entry.`
      );
      return;
    }

    const send = async () => {
      const { showName: name, onSettled: settled } = latest.current;
      const draft = buildLifecycleEmailDraft({ stepType, ...decisionEmailContext(entry, name) });
      try {
        const jobId = await saveDecisionEmailJob(entry, stepType, { ...draft, secretaryNote: '' });
        if (!jobId) throw new Error('Lifecycle email job was not created');
        const result = await sendLifecycleEmailJobs({
          supabase,
          showId: entry.showId,
          jobIds: [jobId],
        });
        // The send handler answers 200 even when delivery fails.
        if (result.failed > 0) throw new Error('Lifecycle email delivery failed');
        toast.success(`${emailTitle} email sent to ${who}`);
      } catch (error) {
        if (error instanceof LifecycleEmailAlreadySavedError) return;
        toast.error(
          `The ${emailName} email to ${who} did not send. Use "Email Exhibitor" on the entry to let them know.`
        );
      } finally {
        settled();
      }
    };
    void send();
  }, []);
}
