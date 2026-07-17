import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildLifecycleDecisionCorrectionDraft } from './render';
import { buildLifecycleEmailIdempotencyKey, type LifecycleEmailStepType } from './types';
import { LifecycleEmailPreviewDialog } from './LifecycleEmailPreviewDialog';
import {
  entryDecisionLifecycleEmailQueryKey,
  fetchEntryDecisionEmailStatuses,
  fetchShowLifecycleEmailSummary,
  saveLifecycleEmailJobForLater,
  sendLifecycleEmailJobs,
  updateReadyLifecycleEmailJob,
  type EntryDecisionEmailJob,
  type EntryDecisionEmailStatus,
  type LifecycleEmailSupabaseClient,
} from './api';

type DecisionStepType = Extract<LifecycleEmailStepType, 'accepted' | 'waitlisted'>;

interface EntryDecisionLifecycleEmailIdempotencyKeyArgs {
  showId: string;
  stepType: DecisionStepType;
  entryId: string;
  enrollmentId?: string | null | undefined;
  correctionForJobId?: string | null | undefined;
}

interface DecisionEmailPrompt {
  entry: EntryManagementEntry;
  stepType: DecisionStepType;
  jobId?: string | null | undefined;
  correctionForJobId?: string | null | undefined;
  title?: string | undefined;
  notNowLabel?: string | undefined;
  initialSubject?: string | null | undefined;
  initialBody?: string | null | undefined;
  initialSecretaryNote?: string | null | undefined;
}

interface UseEntryDecisionLifecycleEmailsArgs {
  showId?: string | undefined;
  showName?: string | undefined;
  entries: EntryManagementEntry[];
}

interface UseEntryDecisionLifecycleEmailsResult {
  statusMap: Record<string, EntryDecisionEmailStatus>;
  openDecisionPrompt: (entry: EntryManagementEntry, stepType: DecisionStepType) => void;
  reviewReadyEmail: (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void;
  prepareCorrectionEmail: (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void;
  dialog: ReactNode;
}

export function buildEntryDecisionLifecycleEmailIdempotencyKey({
  showId,
  stepType,
  entryId,
  enrollmentId,
  correctionForJobId,
}: EntryDecisionLifecycleEmailIdempotencyKeyArgs): string {
  return buildLifecycleEmailIdempotencyKey({
    showId,
    stepType,
    recipientScope: 'enrollment',
    entryId,
    enrollmentId: enrollmentId ?? null,
    correctionForJobId: correctionForJobId ?? null,
  });
}

/**
 * A fresh decision prompt (opened right after an Accept/Waitlist) is stale if the
 * secretary then Undoes that status change — sending its email would announce a
 * decision that no longer holds. Returns true when the entry's CURRENT status no
 * longer matches what the prompt represents (the same supersession principle the
 * bulk/undo path uses). Ready-job reviews and corrections intentionally reference
 * a prior decision, so they are exempt.
 */
export function isDecisionEmailSuperseded(
  prompt: Pick<DecisionEmailPrompt, 'entry' | 'stepType' | 'jobId' | 'correctionForJobId'>,
  entries: EntryManagementEntry[]
): boolean {
  if (prompt.jobId || prompt.correctionForJobId) return false;
  const expected =
    prompt.stepType === 'accepted'
      ? EntryStatus.ACCEPTED
      : prompt.stepType === 'waitlisted'
        ? EntryStatus.WAITLIST
        : undefined;
  if (!expected) return false;
  const current = entries.find(entry => entry.id === prompt.entry.id)?.entryStatus;
  return current !== undefined && current !== expected;
}

export function useEntryDecisionLifecycleEmails({
  showId,
  showName,
  entries,
}: UseEntryDecisionLifecycleEmailsArgs): UseEntryDecisionLifecycleEmailsResult {
  const queryClient = useQueryClient();
  const lifecycleClient = supabase as unknown as LifecycleEmailSupabaseClient;
  const entryIds = useMemo(() => entries.map(entry => entry.id), [entries]);
  const queryKey = useMemo(
    () => (showId ? entryDecisionLifecycleEmailQueryKey(showId, entryIds) : null),
    [entryIds, showId]
  );
  const statusQuery = useQuery({
    queryKey: queryKey ?? ['entry-decision-lifecycle-emails', 'none'],
    queryFn: () =>
      fetchEntryDecisionEmailStatuses({
        supabase: lifecycleClient,
        showId: showId ?? '',
        entryIds,
      }),
    enabled: Boolean(showId && entryIds.length > 0),
    staleTime: 15_000,
  });
  const summaryQuery = useQuery({
    queryKey: showId ? ['show-lifecycle-emails', showId] : ['show-lifecycle-emails', 'none'],
    queryFn: () =>
      fetchShowLifecycleEmailSummary({ supabase: lifecycleClient, showId: showId ?? '' }),
    enabled: Boolean(showId),
    staleTime: 30_000,
  });
  const [prompt, setPrompt] = useState<DecisionEmailPrompt | null>(null);
  const [isSending, setIsSending] = useState(false);

  const invalidateLifecycleEmailQueries = () => {
    if (queryKey) void queryClient.invalidateQueries({ queryKey });
    if (showId) void queryClient.invalidateQueries({ queryKey: ['show-lifecycle-emails', showId] });
  };

  const saveReadyJob = async (
    currentPrompt: DecisionEmailPrompt,
    values: { subject: string; body: string; secretaryNote: string }
  ) => {
    return saveLifecycleEmailJobForLater({
      supabase,
      showId: currentPrompt.entry.showId,
      stepType: currentPrompt.stepType,
      recipientScope: 'enrollment',
      entryId: currentPrompt.entry.id,
      enrollmentId: currentPrompt.entry.registrationId,
      recipientEmail: currentPrompt.entry.ownerEmail,
      recipientName: currentPrompt.entry.ownerName,
      subject: values.subject,
      body: values.body,
      secretaryNote: values.secretaryNote,
      correctionForJobId: currentPrompt.correctionForJobId ?? null,
      idempotencyKey: buildEntryDecisionLifecycleEmailIdempotencyKey({
        showId: currentPrompt.entry.showId,
        stepType: currentPrompt.stepType,
        entryId: currentPrompt.entry.id,
        enrollmentId: currentPrompt.entry.registrationId,
        correctionForJobId: currentPrompt.correctionForJobId ?? null,
      }),
    });
  };

  const openDecisionPrompt = (entry: EntryManagementEntry, stepType: DecisionStepType) => {
    const step = summaryQuery.data?.steps.find(candidate => candidate.stepType === stepType);
    if (step?.isEnabled === false) return;
    setPrompt({ entry, stepType });
  };

  const reviewReadyEmail = (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => {
    setPrompt({
      entry,
      stepType: job.stepType,
      jobId: job.id,
      correctionForJobId: job.correctionForJobId,
      title: job.correctionForJobId ? 'Review correction email' : undefined,
      notNowLabel: 'Keep for later',
      initialSubject: job.subject,
      initialBody: job.body,
      initialSecretaryNote: job.secretaryNote,
    });
  };

  const prepareCorrectionEmail = (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => {
    const draft = buildLifecycleDecisionCorrectionDraft({
      showName: showName ?? 'this show',
      recipientName: entry.ownerName,
      dogName: entry.dogName,
      previousDecision: job.stepType,
      currentDecisionLabel: getDecisionLabel(entry.entryStatus),
    });

    setPrompt({
      entry,
      stepType: getCorrectionStepType(entry.entryStatus, job.stepType),
      correctionForJobId: job.id,
      title: 'Review correction email',
      notNowLabel: 'Save for later',
      initialSubject: draft.subject,
      initialBody: draft.body,
    });
  };

  const dialog = prompt ? (
    <LifecycleEmailPreviewDialog
      key={`${prompt.entry.id}:${prompt.jobId ?? 'new'}:${prompt.correctionForJobId ?? 'original'}:${prompt.stepType}`}
      open={true}
      onOpenChange={open => {
        if (!open) setPrompt(null);
      }}
      stepType={prompt.stepType}
      title={prompt.title}
      notNowLabel={prompt.notNowLabel}
      initialSubject={prompt.initialSubject}
      initialBody={prompt.initialBody}
      initialSecretaryNote={prompt.initialSecretaryNote}
      isSending={isSending}
      show={{ name: showName ?? 'this show' }}
      recipient={{
        name: prompt.entry.ownerName,
        email: prompt.entry.ownerEmail,
      }}
      entry={{
        dogName: prompt.entry.dogName,
        className: prompt.entry.classes[0]?.name ?? null,
        armbandNumber: prompt.entry.armbandNumber ?? null,
        amountDue: Math.max(0, prompt.entry.totalFee - prompt.entry.paidAmount),
      }}
      onNotNow={values => {
        if (prompt.jobId) {
          void updateReadyLifecycleEmailJob({
            supabase: lifecycleClient,
            jobId: prompt.jobId,
            subject: values.subject,
            body: values.body,
            secretaryNote: values.secretaryNote,
          })
            .then(() => {
              toast.info('Email kept for later review');
              invalidateLifecycleEmailQueries();
            })
            .catch(() => toast.error('Entry decision is saved. The email was not updated.'));
          setPrompt(null);
          return;
        }
        void saveReadyJob(prompt, values)
          .then(jobId => {
            if (!jobId) throw new Error('Lifecycle email job was not created');
            toast.info(
              prompt.correctionForJobId
                ? 'Correction ready for later review'
                : 'Email ready for later review'
            );
            invalidateLifecycleEmailQueries();
          })
          .catch(() => toast.error('Entry decision is saved. The email was not saved for later.'));
        setPrompt(null);
      }}
      onSend={async values => {
        if (isDecisionEmailSuperseded(prompt, entries)) {
          toast.error('Entry status changed since this prompt opened — email not sent.');
          setPrompt(null);
          return;
        }
        setIsSending(true);
        try {
          const jobId = prompt.jobId ?? (await saveReadyJob(prompt, values));
          if (!jobId) throw new Error('Lifecycle email job was not created');
          await sendLifecycleEmailJobs({
            supabase,
            showId: prompt.entry.showId,
            jobIds: [jobId],
            subject: values.subject,
            body: values.body,
            secretaryNote: values.secretaryNote,
          });
          toast.success(
            prompt.correctionForJobId ? 'Correction email sent' : 'Decision email sent'
          );
          invalidateLifecycleEmailQueries();
          setPrompt(null);
        } catch {
          toast.error('Entry decision is saved. The email did not send yet.');
        } finally {
          setIsSending(false);
        }
      }}
    />
  ) : null;

  return {
    statusMap: statusQuery.data ?? {},
    openDecisionPrompt,
    reviewReadyEmail,
    prepareCorrectionEmail,
    dialog,
  };
}

function getCorrectionStepType(
  currentStatus: EntryStatus,
  fallback: DecisionStepType
): DecisionStepType {
  if (currentStatus === EntryStatus.ACCEPTED) return 'accepted';
  if (currentStatus === EntryStatus.WAITLIST) return 'waitlisted';
  return fallback;
}

function getDecisionLabel(status: EntryStatus): string {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return 'Accepted';
    case EntryStatus.WAITLIST:
      return 'Waitlisted';
    case EntryStatus.REJECTED:
      return 'Not accepted';
    case EntryStatus.MISSING_INFO:
      return 'Missing information';
    case EntryStatus.CANCELLED:
      return 'Withdrawn';
    case EntryStatus.SCRATCHED:
      return 'Pulled';
    case EntryStatus.PENDING:
    default:
      return 'Pending review';
  }
}
