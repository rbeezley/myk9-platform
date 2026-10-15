import { useCallback, useMemo, useRef, useState } from 'react';
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
  type LifecycleEmailSupabaseClient,
} from './api';
import {
  REGISTRATION_NUMBER_NEEDED_STEP,
  buildRegistrationNumberNeededIdempotencyKey,
  countRegistrationNumberNeededJobs,
} from './registrationNumberNeeded';

/** An entry awaiting a registration number, with the registry the number is for. */
export interface RegistrationNumberNeededTarget {
  entry: EntryManagementEntry;
  registryId?: string | null | undefined;
}

export interface RegistrationNumberNeededOfferResult {
  /** The club turned this step off for the show: nothing was offered. */
  disabled: boolean;
  /** Entries whose exhibitor has no email address: no email was prepared for them. */
  noEmail: RegistrationNumberNeededTarget[];
}

interface UseRegistrationNumberNeededEmailArgs {
  showId?: string | undefined;
  showName?: string | undefined;
}

interface UseRegistrationNumberNeededEmailResult {
  /** True once the show's step settings are known and the step is on. Online-only. */
  stepEnabled: boolean;
  /** Offers the preview for each target in turn (secretary save). Nothing is sent unasked. */
  offer: (
    targets: RegistrationNumberNeededTarget[]
  ) => Promise<RegistrationNumberNeededOfferResult>;
  /** Opens a fresh preview for one entry (Send reminder on the Exceptions row). */
  sendReminder: (target: RegistrationNumberNeededTarget) => void;
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
 * secretary reads the email, then sends or skips it. Skip saves nothing, so no
 * stale ready job can reach the exhibitor later. Sending is online-only, like
 * every lifecycle send; the edge function re-checks that the entry is still held.
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

  const offer = useCallback(
    async (
      targets: RegistrationNumberNeededTarget[]
    ): Promise<RegistrationNumberNeededOfferResult> => {
      if (!showId || targets.length === 0) return { disabled: false, noEmail: [] };
      const summary = await queryClient.fetchQuery({
        queryKey: summaryKey,
        queryFn: () => fetchShowLifecycleEmailSummary({ supabase: lifecycleClient, showId }),
        staleTime: 30_000,
      });
      if (!isStepOn(summary.steps)) return { disabled: true, noEmail: [] };
      const reachable = targets.filter(target => hasContactEmail(target.entry));
      setQueue(previous => [...previous, ...reachable.map(toPrompt)]);
      return { disabled: false, noEmail: targets.filter(target => !hasContactEmail(target.entry)) };
    },
    [lifecycleClient, queryClient, showId, summaryKey]
  );

  const sendReminder = (target: RegistrationNumberNeededTarget) => {
    if (!stepEnabled || !hasContactEmail(target.entry)) return;
    setQueue([toPrompt(target)]);
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
        const priorCount = await countRegistrationNumberNeededJobs({
          supabase: lifecycleClient,
          showId: entry.showId,
          entryId: entry.id,
        });
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
            priorCount,
          }),
        });
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
        toast.info(`${entry.dogName} now has a registration number, so no email was sent.`);
      } else if (result.failed > 0) {
        toast.error("The email couldn't be sent. It's still on the Scheduled emails list.");
      } else {
        toast.success('Registration number email sent');
      }
      void queryClient.invalidateQueries({ queryKey: summaryKey });
      closePrompt(id);
    } catch {
      toast.error('The email did not send. Try Send reminder again.');
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
        if (!open) closePrompt(current.id);
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
      onNotNow={() => closePrompt(current.id)}
      onSend={values => send(current, values)}
    />
  ) : null;

  return { stepEnabled, offer, sendReminder, dialog };
}
