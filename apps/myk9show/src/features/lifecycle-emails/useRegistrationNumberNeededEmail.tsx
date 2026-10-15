import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { LifecycleEmailPreviewDialog } from './LifecycleEmailPreviewDialog';
import {
  fetchShowLifecycleEmailSummary,
  saveLifecycleEmailJobForLater,
  sendLifecycleEmailJobs,
  skipLifecycleEmailJobsForReview,
  type LifecycleEmailSupabaseClient,
} from './api';
import {
  REGISTRATION_NUMBER_NEEDED_STEP,
  buildRegistrationNumberNeededIdempotencyKey,
  readRegistrationNumberNeededHistory,
  fetchRegistrationNumberNeededJobCounts,
} from './registrationNumberNeeded';

/** An entry awaiting a registration number, with the registry the number is for. */
export interface RegistrationNumberNeededTarget {
  entry: EntryManagementEntry;
  registryId?: string | null | undefined;
}

interface UseRegistrationNumberNeededEmailArgs {
  showId?: string | undefined;
  showName?: string | undefined;
}

interface UseRegistrationNumberNeededEmailResult {
  /** True once the show's step settings are known and the step is on. Online-only. */
  stepEnabled: boolean;
  /** True once an email job exists for the entry (any status): the row offers Send reminder. */
  hasEmailed: (entryId: string) => boolean;
  /** Opens the preview for one entry (Email exhibitor, or Send reminder on a later one). */
  openEmail: (target: RegistrationNumberNeededTarget) => void;
  dialog: ReactNode;
}

const isStepOn = (steps: ReadonlyArray<{ stepType: string; isEnabled: boolean }> | undefined) =>
  steps?.find(step => step.stepType === REGISTRATION_NUMBER_NEEDED_STEP)?.isEnabled !== false;

interface Prompt {
  id: number;
  target: RegistrationNumberNeededTarget;
}

export const hasContactEmail = (entry: Pick<EntryManagementEntry, 'ownerEmail'>): boolean =>
  Boolean(entry.ownerEmail?.trim());

/**
 * The "registration number needed" email (MYK9-1162), on the
 * `useEntryDecisionLifecycleEmails` pattern and the same preview dialog: the
 * secretary reads the email, then sends or skips it. Closing a preview whose job
 * was already saved marks that job skipped, so no stale ready job can be batch-sent
 * later. Sending is online-only, like every lifecycle send; the edge function
 * re-checks that the entry is still held.
 */
export function useRegistrationNumberNeededEmail({
  showId,
  showName,
}: UseRegistrationNumberNeededEmailArgs): UseRegistrationNumberNeededEmailResult {
  const queryClient = useQueryClient();
  const lifecycleClient = supabase as unknown as LifecycleEmailSupabaseClient;
  const summaryKey = useMemo(() => ['show-lifecycle-emails', showId ?? 'none'], [showId]);
  const readSummary = () =>
    fetchShowLifecycleEmailSummary({ supabase: lifecycleClient, showId: showId ?? '' });
  const summaryQuery = useQuery({
    queryKey: summaryKey,
    queryFn: readSummary,
    enabled: Boolean(showId),
    staleTime: 30_000,
  });
  const stepEnabled = summaryQuery.data !== undefined && isStepOn(summaryQuery.data.steps);

  const countsKey = useMemo(() => ['registration-number-needed-jobs', showId ?? 'none'], [showId]);
  // One read for the whole list. While it is pending or offline every row reads as the first
  // email; the send recounts before saving, so the idempotency key is still right.
  const countsQuery = useQuery({
    queryKey: countsKey,
    queryFn: () =>
      fetchRegistrationNumberNeededJobCounts({ supabase: lifecycleClient, showId: showId ?? '' }),
    enabled: Boolean(showId),
    staleTime: 15_000,
  });
  const hasEmailed = (entryId: string) => (countsQuery.data?.[entryId] ?? 0) > 0;

  // Each open preview is a prompt with its own id, so a send that finishes later removes
  // only the prompt that started it, never a newer one the secretary opened meanwhile.
  const [queue, setQueue] = useState<Prompt[]>([]);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const nextIdRef = useRef(0);
  // A synchronous guard per prompt: two quick Send clicks must not both pass the state check.
  const sendingIdsRef = useRef(new Set<number>());
  // The job a prompt already saved. A retry after a failed send re-sends THIS job: saving
  // again would add a second sendable job under a new reminder key.
  const savedJobIdsRef = useRef(new Map<number, string>());
  const current = queue[0] ?? null;
  const toPrompt = (target: RegistrationNumberNeededTarget): Prompt => {
    nextIdRef.current += 1;
    return { id: nextIdRef.current, target };
  };
  const closePrompt = (id: number) => {
    savedJobIdsRef.current.delete(id);
    setQueue(previous => previous.filter(prompt => prompt.id !== id));
  };
  // Skip and dismiss. A job this prompt already saved but did not deliver is marked skipped
  // first, so it cannot be batch-sent later from Scheduled emails. If that fails the preview
  // stays open and says so: dropping it would leave the sendable job behind unnoticed.
  // Every read of these jobs: the row's label, the Scheduled emails summary and its
  // Review list (whose cache would otherwise show a replaced or skipped email).
  const invalidateJobReads = () => {
    void queryClient.invalidateQueries({ queryKey: summaryKey });
    void queryClient.invalidateQueries({ queryKey: countsKey });
    void queryClient.invalidateQueries({ queryKey: ['show-lifecycle-email-review', showId] });
  };

  const dismissPrompt = async (id: number) => {
    // Never mid-send: withdrawing the job while its send is in flight would race the
    // send for the job's final state. The send finishes (and closes it) first.
    if (sendingIdsRef.current.has(id)) return;
    const savedJobId = savedJobIdsRef.current.get(id);
    if (savedJobId) {
      try {
        await skipLifecycleEmailJobsForReview({ supabase: lifecycleClient, jobIds: [savedJobId] });
      } catch {
        toast.error("The saved email couldn't be withdrawn. Try Skip again.");
        return;
      }
      invalidateJobReads();
    }
    closePrompt(id);
  };

  const openEmail = (target: RegistrationNumberNeededTarget) => {
    if (!stepEnabled || !hasContactEmail(target.entry)) return;
    // One preview at a time: the open one may hold a saved job that Skip must withdraw first.
    setQueue(previous => (previous.length > 0 ? previous : [toPrompt(target)]));
  };

  const send = async (
    { id, target }: Prompt,
    values: { subject: string; body: string; secretaryNote: string }
  ) => {
    if (sendingIdsRef.current.has(id)) return;
    sendingIdsRef.current.add(id);
    setSendingId(id);
    const { entry } = target;
    try {
      let jobId = savedJobIdsRef.current.get(id) ?? null;
      if (!jobId) {
        const historyArgs = { supabase: lifecycleClient, showId: entry.showId, entryId: entry.id };
        const history = await readRegistrationNumberNeededHistory(historyArgs);
        // The database allows ONE waiting or failed email per entry. If one exists it
        // is the email to send: re-sending it is safe from double delivery, because
        // every send carries the job's own idempotency key to the provider.
        jobId = history.outstandingJobIds[0] ?? null;
        if (!jobId) {
          try {
            jobId = await saveLifecycleEmailJobForLater({
              supabase,
              showId: entry.showId,
              stepType: REGISTRATION_NUMBER_NEEDED_STEP,
              recipientScope: 'entry',
              entryId: entry.id,
              recipientEmail: entry.ownerEmail,
              recipientName: entry.ownerName,
              subject: values.subject,
              body: values.body,
              secretaryNote: values.secretaryNote,
              idempotencyKey: buildRegistrationNumberNeededIdempotencyKey({
                showId: entry.showId,
                entryId: entry.id,
                priorCount: history.count,
              }),
            });
          } catch (error) {
            // Another tab or visit saved one first: the index refused ours. Use theirs.
            const after = await readRegistrationNumberNeededHistory(historyArgs);
            jobId = after.outstandingJobIds[0] ?? null;
            if (!jobId) throw error;
          }
        }
        if (!jobId) throw new Error('Lifecycle email job was not created');
        savedJobIdsRef.current.set(id, jobId);
      }
      const result = await sendLifecycleEmailJobs({
        supabase,
        showId: entry.showId,
        jobIds: [jobId],
        subject: values.subject,
        body: values.body,
        secretaryNote: values.secretaryNote,
      });
      if (result.skipped) {
        // The server skips when the entry is no longer held OR when it could not check;
        // say only what is certain.
        toast.info(
          `No email was sent for ${entry.dogName}. Check the list: the number may already be on file.`
        );
      } else if (result.failed > 0) {
        toast.error("The email couldn't be sent. It's still on the Scheduled emails list.");
      } else {
        toast.success('Registration number email sent');
      }
      invalidateJobReads();
      closePrompt(id);
    } catch {
      toast.error('The email did not send. Try again.');
    } finally {
      sendingIdsRef.current.delete(id);
      setSendingId(previous => (previous === id ? null : previous));
    }
  };

  const dialog = current ? (
    <LifecycleEmailPreviewDialog
      key={current.id}
      open={true}
      onOpenChange={open => {
        if (!open) void dismissPrompt(current.id);
      }}
      stepType={REGISTRATION_NUMBER_NEEDED_STEP}
      notNowLabel="Skip"
      isSending={sendingId === current.id}
      show={{ name: showName ?? 'this show' }}
      recipient={{ name: current.target.entry.ownerName, email: current.target.entry.ownerEmail }}
      entry={{
        dogName: current.target.entry.dogName,
        className: current.target.entry.classes[0]?.name ?? null,
        registryName: current.target.registryId ?? null,
      }}
      onNotNow={() => void dismissPrompt(current.id)}
      onSend={values => send(current, values)}
    />
  ) : null;

  return { stepEnabled, hasEmailed, openEmail, dialog };
}
