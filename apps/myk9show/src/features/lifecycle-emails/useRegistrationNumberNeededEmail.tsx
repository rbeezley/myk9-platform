import { generateUUID } from '@/utils/idUtils';
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { LifecycleEmailPreviewDialog } from './LifecycleEmailPreviewDialog';
import { fetchShowLifecycleEmailSummary, type LifecycleEmailSupabaseClient } from './api';
import {
  REGISTRATION_NUMBER_NEEDED_STEP,
  fetchRegistrationNumberNeededJobCounts,
  sendRegistrationNumberNeededEmail,
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
  /**
   * Names this preview's email to the server. Every Send press in the preview reuses
   * it, so a response that never arrived cannot turn into a second email; a new
   * Send reminder click opens a new preview and a new email.
   */
  requestId: string;
}

export const hasContactEmail = (entry: Pick<EntryManagementEntry, 'ownerEmail'>): boolean =>
  Boolean(entry.ownerEmail?.trim());

/**
 * The "registration number needed" email (MYK9-1162): the same preview dialog as the
 * decision emails, but the preview is text only. Send hands the reviewed text to ONE
 * server action that decides everything else (authorization, the step switch, whether the
 * entry is still held, the owner's current address, replacing an earlier unsent email).
 * Skip and close save nothing and call nothing. Sending is online-only.
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
  // One read for the whole list, used only for the button label. While it is pending or
  // offline every row reads "Email exhibitor"; the server decides what each send is.
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
  const current = queue[0] ?? null;
  const closePrompt = (id: number) =>
    setQueue(previous => previous.filter(prompt => prompt.id !== id));
  // Skip and close. The preview holds no saved job, so there is nothing to withdraw; while a
  // send is in flight it is ignored (the send finishes and closes its own preview).
  const dismissPrompt = (id: number) => {
    if (sendingIdsRef.current.has(id)) return;
    closePrompt(id);
  };
  // Every read of these jobs: the row's label, the Scheduled emails summary and its Review
  // list (whose cache would otherwise show a replaced or skipped email).
  const invalidateJobReads = () => {
    void queryClient.invalidateQueries({ queryKey: summaryKey });
    void queryClient.invalidateQueries({ queryKey: countsKey });
    void queryClient.invalidateQueries({ queryKey: ['show-lifecycle-email-review', showId] });
  };

  const openEmail = (target: RegistrationNumberNeededTarget) => {
    if (!stepEnabled || !hasContactEmail(target.entry)) return;
    // One preview at a time.
    setQueue(previous => {
      if (previous.length > 0) return previous;
      nextIdRef.current += 1;
      return [{ id: nextIdRef.current, target, requestId: generateUUID() }];
    });
  };

  const send = async (
    { id, target, requestId }: Prompt,
    values: { subject: string; body: string; secretaryNote: string }
  ) => {
    if (sendingIdsRef.current.has(id)) return;
    sendingIdsRef.current.add(id);
    setSendingId(id);
    const { entry } = target;
    try {
      const outcome = await sendRegistrationNumberNeededEmail({
        supabase,
        showId: entry.showId,
        entryId: entry.id,
        requestId,
        subject: values.subject,
        body: values.body,
        secretaryNote: values.secretaryNote,
      });
      if (outcome.status === 'sent' && outcome.recovered) {
        toast.success(
          `The earlier email to ${entry.dogName}'s owner has been sent. Send a reminder if you changed the text.`
        );
      } else if (outcome.status === 'sent') {
        toast.success('Registration number email sent');
      } else if (outcome.status === 'failed') {
        toast.error("The email couldn't be sent. Press Send reminder to try again.");
      } else if (outcome.status === 'busy') {
        toast.info(`An email for ${entry.dogName} is already being sent.`);
      } else if (outcome.reason === 'not_held') {
        toast.info(`No email was sent for ${entry.dogName}: the registration number is on file.`);
      } else if (outcome.reason === 'unverified') {
        toast.error(
          `No email was sent for ${entry.dogName}: the registration number couldn't be checked. Try again.`
        );
      } else {
        toast.info(`No email on file for ${entry.dogName}. Contact them by phone.`);
      }
      invalidateJobReads();
      closePrompt(id);
    } catch {
      toast.error('The email did not send. Try again.');
      invalidateJobReads();
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
        if (!open) dismissPrompt(current.id);
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
      onNotNow={() => dismissPrompt(current.id)}
      onSend={values => send(current, values)}
    />
  ) : null;

  return { stepEnabled, hasEmailed, openEmail, dialog };
}
