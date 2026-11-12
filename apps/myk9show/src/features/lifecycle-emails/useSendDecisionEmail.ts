import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { LifecycleEmailAlreadySavedError, sendLifecycleEmailJobs } from './api';
import { decisionEmailContext, sortDecidedEntries, type DecisionStepType } from './decisionEmail';
import { buildLifecycleEmailDraft } from './render';
import { joinNames } from './multiEntryDecision';
import { saveDecisionEmailJob } from './saveDecisionEmailJob';

const EMAIL_NAME: Record<DecisionStepType, { lower: string; title: string }> = {
  accepted: { lower: 'acceptance', title: 'Acceptance' },
  waitlisted: { lower: 'waitlist', title: 'Waitlist' },
};

interface SendDecisionEmailArgs {
  showName: string | undefined;
  /** A send was attempted for this show's entry: its email status may have changed. */
  onSettled: (showId: string) => void;
}

/**
 * Sends a registration's acceptance or waitlist email with no preview (owner decision 2026-11-09,
 * MYK9-1800). The caller invokes it once the decision has STOOD: the status change's Undo
 * toast has closed without Undo and the entries still have that status. It is handed the
 * entries of ONE registration decided in that action (owner decision 2026-11-12: one email per
 * entry form, listing every class), as they are then, so the email carries the armband the
 * Accept itself assigned. A job per registration, keyed on the decided entry ids.
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
 * The caller passes the name of the show the decision was made on: she may have switched
 * shows inside the Undo window, and the live name would then be the wrong show's.
 *
 * The returned function is stable and safe to call after the cockpit has unmounted (she
 * switched view inside the window): it touches only refs, the API and the toaster.
 */
const UNNAMED_SHOW = 'this show';

/**
 * Which entry a notice is about, and where to act on it. After a show switch the entry is not
 * on screen, so the notice names the show and says to go back to it; on the same show (or with
 * no name to compare) it stays as short as before.
 */
function whichEntry(
  entries: EntryManagementEntry[],
  decidedOnShowName: string,
  currentShowName: string | undefined
): { about: string; emailLater: string } {
  const elsewhere =
    decidedOnShowName !== UNNAMED_SHOW && decidedOnShowName !== (currentShowName ?? UNNAMED_SHOW);
  // One dog is named once however many of its classes were decided; several dogs by name.
  const dogs = [
    ...new Set(entries.map(entry => entry.dogName?.trim()).filter(Boolean)),
  ] as string[];
  const dog = joinNames(dogs);
  const about = `${dog ? ` for ${dog}` : ''}${elsewhere ? ` at ${decidedOnShowName}` : ''}`;
  const onEntry =
    dogs.length > 1
      ? 'on the entry form'
      : dog
        ? `on ${dog}'s ${entries.length > 1 ? 'entry form' : 'entry'}`
        : entries.length > 1
          ? 'on the entry form'
          : 'on the entry';
  const emailLater = elsewhere
    ? `go back to ${decidedOnShowName} and use "Email Exhibitor" ${onEntry}`
    : `use "Email Exhibitor" ${onEntry}`;
  return { about, emailLater };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function useSendDecisionEmail({
  showName,
  onSettled,
}: SendDecisionEmailArgs): (
  entries: EntryManagementEntry[],
  stepType: DecisionStepType,
  decidedOnShowName: string
) => void {
  const latest = useRef({ showName, onSettled });
  useEffect(() => {
    latest.current = { showName, onSettled };
  });

  return useCallback(
    (decided: EntryManagementEntry[], stepType: DecisionStepType, decidedOnShowName: string) => {
      const entries = sortDecidedEntries(decided);
      const [entry] = entries;
      if (!entry) return;
      const { lower: emailName, title: emailTitle } = EMAIL_NAME[stepType];
      const ownerName = entry.ownerName?.trim();
      const who = ownerName || 'the exhibitor';
      // She may have switched shows inside the Undo window: every notice names the dog, and the
      // show and the way back to it when that show is no longer the one on screen.
      const { about, emailLater } = whichEntry(entries, decidedOnShowName, latest.current.showName);

      if (!entry.ownerEmail?.trim()) {
        toast.info(
          `${ownerName || 'The exhibitor'} has no email on file, so no ${emailName} email was sent${about}.`
        );
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.error(
          `You're offline, so the ${emailName} email to ${who}${about} was not sent. When you are back online, ${emailLater}.`
        );
        return;
      }

      const send = async () => {
        const { onSettled: settled } = latest.current;
        const name = decidedOnShowName;
        const draft = buildLifecycleEmailDraft({
          stepType,
          ...decisionEmailContext(entries, name),
        });
        try {
          const jobId = await saveDecisionEmailJob(entries, stepType, {
            ...draft,
            secretaryNote: '',
          });
          if (!jobId) throw new Error('Lifecycle email job was not created');
          const result = await sendLifecycleEmailJobs({
            supabase,
            showId: entry.showId,
            jobIds: [jobId],
          });
          // The send handler answers 200 even when delivery fails.
          if (result.failed > 0) throw new Error('Lifecycle email delivery failed');
          toast.success(`${emailTitle} email sent to ${who}${about}`);
        } catch (error) {
          if (error instanceof LifecycleEmailAlreadySavedError) return;
          toast.error(
            `The ${emailName} email to ${who}${about} did not send. ${capitalize(emailLater)} to let them know.`
          );
        } finally {
          settled(entry.showId);
        }
      };
      void send();
    },
    []
  );
}
