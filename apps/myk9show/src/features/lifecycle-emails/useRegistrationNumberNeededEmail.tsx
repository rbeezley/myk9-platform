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

  const [queue, setQueue] = useState<RegistrationNumberNeededTarget[]>([]);
  const [isSending, setIsSending] = useState(false);
  // A synchronous guard: two quick Send clicks must not both pass the state check.
  const sendingRef = useRef(false);
  const current = queue[0] ?? null;
  const closeCurrent = () => setQueue(previous => previous.slice(1));

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
      setQueue(previous => [...previous, ...reachable]);
      return { disabled: false, noEmail: targets.filter(target => !hasContactEmail(target.entry)) };
    },
    [lifecycleClient, queryClient, showId, summaryKey]
  );

  const sendReminder = (target: RegistrationNumberNeededTarget) => {
    if (!stepEnabled || !hasContactEmail(target.entry)) return;
    setQueue([target]);
  };

  const send = async (
    target: RegistrationNumberNeededTarget,
    values: { subject: string; body: string; secretaryNote: string }
  ) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    const { entry } = target;
    try {
      const priorCount = await countRegistrationNumberNeededJobs({
        supabase: lifecycleClient,
        showId: entry.showId,
        entryId: entry.id,
      });
      const jobId = await saveLifecycleEmailJobForLater({
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
      closeCurrent();
    } catch {
      toast.error('The email did not send. Try Send reminder again.');
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const dialog = current ? (
    <LifecycleEmailPreviewDialog
      key={current.entry.id}
      open={true}
      onOpenChange={open => {
        if (!open) closeCurrent();
      }}
      stepType={REGISTRATION_NUMBER_NEEDED_STEP}
      notNowLabel="Skip"
      isSending={isSending}
      show={{ name: showName ?? 'this show' }}
      recipient={{ name: current.entry.ownerName, email: current.entry.ownerEmail }}
      entry={{
        dogName: current.entry.dogName,
        className: current.entry.classes[0]?.name ?? null,
        registryName: current.registryId ?? null,
      }}
      onNotNow={closeCurrent}
      onSend={values => send(current, values)}
    />
  ) : null;

  return { stepEnabled, offer, sendReminder, dialog };
}
