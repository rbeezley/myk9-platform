import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { STATUS_UNDO_WINDOW_MS } from '@/lib/undoToast';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { sendLifecycleEmailJobs } from './api';
import {
  decisionEmailContext,
  isDecisionEmailSuperseded,
  type DecisionStepType,
} from './decisionEmail';
import { buildLifecycleEmailDraft } from './render';
import { saveDecisionEmailJob } from './saveDecisionEmailJob';

/** A beat after the Undo toast is gone, so a last-moment Undo has reached the entry list. */
export const DECISION_EMAIL_SEND_DELAY_MS = STATUS_UNDO_WINDOW_MS + 1000;

const EMAIL_NAME: Record<DecisionStepType, string> = {
  accepted: 'Acceptance',
  waitlisted: 'Waitlist',
};

interface PendingDecisionEmail {
  timer: ReturnType<typeof setTimeout>;
  entry: EntryManagementEntry;
  stepType: DecisionStepType;
}

interface AutoSendDecisionEmailArgs {
  /** The live entry list: an Undo shows up here as a changed status. */
  entries: EntryManagementEntry[];
  showName: string | undefined;
  /** The email could not even be prepared: hand her the preview so she can send it herself. */
  onCouldNotPrepare: (entry: EntryManagementEntry, stepType: DecisionStepType) => void;
  /** A send was attempted: the entry's email status may have changed. */
  onSettled: () => void;
}

/**
 * Sends the acceptance or waitlist email by itself once the secretary's decision has stood
 * for the Undo window (owner decision 2026-11-09, MYK9-1800). The per-show switch in
 * Scheduled emails is the decision to email; nothing is asked per entry.
 *
 * Nothing is saved or sent while she can still take the decision back: an Undo inside the
 * window leaves no email and no job. If she leaves the page inside the window the email is
 * sent then, so it is never silently dropped. The status is re-read at send time either way.
 */
export function useAutoSendDecisionEmail({
  entries,
  showName,
  onCouldNotPrepare,
  onSettled,
}: AutoSendDecisionEmailArgs): (entry: EntryManagementEntry, stepType: DecisionStepType) => void {
  const pending = useRef(new Map<string, PendingDecisionEmail>());

  const send = async (entry: EntryManagementEntry, stepType: DecisionStepType) => {
    if (isDecisionEmailSuperseded({ entry, stepType }, entries)) return;
    const emailName = EMAIL_NAME[stepType].toLowerCase();
    const context = decisionEmailContext(entry, showName);
    const draft = buildLifecycleEmailDraft({ stepType, ...context });
    let jobId: string | null;
    try {
      jobId = await saveDecisionEmailJob(entry, stepType, { ...draft, secretaryNote: '' });
      if (!jobId) throw new Error('Lifecycle email job was not created');
    } catch {
      toast.error(`Entry decision is saved. The ${emailName} email is open for you to send.`);
      onCouldNotPrepare(entry, stepType);
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
      const to = entry.ownerName?.trim();
      toast.success(`${EMAIL_NAME[stepType]} email sent${to ? ` to ${to}` : ''}`);
    } catch {
      toast.error(
        `Entry decision is saved. The ${emailName} email did not send. Press "Email ready" on the entry to try again.`
      );
    } finally {
      onSettled();
    }
  };

  // Timers and the unmount flush call whatever `send` the latest render made, so they read
  // the entry list as it is when they fire, not as it was when Accept was pressed.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  // Leaving the page inside the window must not drop the email: send what is still waiting.
  useEffect(() => {
    const waiting = pending.current;
    return () => {
      waiting.forEach(({ timer, entry, stepType }) => {
        clearTimeout(timer);
        void sendRef.current(entry, stepType);
      });
      waiting.clear();
    };
  }, []);

  return useCallback((entry: EntryManagementEntry, stepType: DecisionStepType) => {
    const waiting = pending.current;
    // A second decision on the same entry restarts its window; only the last one is announced.
    const earlier = waiting.get(entry.id);
    if (earlier) clearTimeout(earlier.timer);
    const timer = setTimeout(() => {
      waiting.delete(entry.id);
      void sendRef.current(entry, stepType);
    }, DECISION_EMAIL_SEND_DELAY_MS);
    waiting.set(entry.id, { timer, entry, stepType });
  }, []);
}
