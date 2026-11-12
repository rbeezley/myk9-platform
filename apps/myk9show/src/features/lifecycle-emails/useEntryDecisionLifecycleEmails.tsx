import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildLifecycleDecisionCorrectionDraft } from './render';
import { LifecycleEmailPreviewDialog } from './LifecycleEmailPreviewDialog';
import {
  decisionEmailContext,
  isDecisionEmailSuperseded,
  type DecisionStepType,
} from './decisionEmail';
import { saveDecisionEmailJob } from './saveDecisionEmailJob';
import { useSendDecisionEmail } from './useSendDecisionEmail';
import {
  entryDecisionLifecycleEmailQueryKey,
  fetchEntryDecisionEmailStatuses,
  fetchShowLifecycleEmailSummary,
  sendLifecycleEmailJobs,
  updateReadyLifecycleEmailJob,
  type EntryDecisionEmailJob,
  type EntryDecisionEmailStatus,
  type LifecycleEmailSupabaseClient,
} from './api';

const EMPTY_STATUS_MAP: Record<string, EntryDecisionEmailStatus> = {};

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
  /** `showSendsDecisionEmailsUnasked` for this show; false keeps the preview. */
  sendUnasked?: boolean | undefined;
}

/** What follows an Accept or Waitlist on one entry. */
export type DecisionEmailPlan = 'send' | 'preview' | 'none';

interface UseEntryDecisionLifecycleEmailsResult {
  statusMap: Record<string, EntryDecisionEmailStatus>;
  /**
   * Decided when she presses Accept or Waitlist. `send`: the email goes by itself once the
   * decision has stood. `preview`: she is shown it first. `none`: this show does not email it.
   */
  decisionEmailPlan: (stepType: DecisionStepType) => DecisionEmailPlan;
  openDecisionPrompt: (entry: EntryManagementEntry, stepType: DecisionStepType) => void;
  /** For a decision that has stood; stable, and safe to call after the cockpit unmounts. */
  sendDecisionEmail: (
    entry: EntryManagementEntry,
    stepType: DecisionStepType,
    showName?: string
  ) => void;
  reviewReadyEmail: (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void;
  prepareCorrectionEmail: (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void;
  dialog: ReactNode;
}

export function useEntryDecisionLifecycleEmails({
  showId,
  showName,
  entries,
  sendUnasked = false,
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

  const saveReadyJob = (
    currentPrompt: DecisionEmailPrompt,
    values: { subject: string; body: string; secretaryNote: string }
  ) =>
    saveDecisionEmailJob(
      currentPrompt.entry,
      currentPrompt.stepType,
      values,
      currentPrompt.correctionForJobId
    );

  const sendDecisionEmail = useSendDecisionEmail({
    showName,
    onSettled: invalidateLifecycleEmailQueries,
  });

  // The show's switch in Scheduled emails is the decision to email (MYK9-1800). On, and the
  // show is published and not yet over: the email goes by itself. On, but the show is a
  // draft or finished, or the switch is not known yet: she gets the preview. Off: nothing.
  const decisionEmailPlan = (stepType: DecisionStepType): DecisionEmailPlan => {
    const step = summaryQuery.data?.steps.find(candidate => candidate.stepType === stepType);
    if (!step) return 'preview';
    if (!step.isEnabled) return 'none';
    // Offline, an unasked send could only end in a notice; the preview is the specified fallback.
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    return sendUnasked && !offline ? 'send' : 'preview';
  };

  const openDecisionPrompt = (entry: EntryManagementEntry, stepType: DecisionStepType) =>
    setPrompt({ entry, stepType });

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
      {...decisionEmailContext(prompt.entry, showName)}
      onNotNow={values => {
        // Saving a superseded fresh decision for later would persist a sendable
        // job for a decision that was undone — same hazard as sending it now.
        // (Exempt for jobId/correction prompts, per isDecisionEmailSuperseded.)
        if (isDecisionEmailSuperseded(prompt, entries)) {
          toast.error('Entry status changed since this prompt opened — email not saved.');
          setPrompt(null);
          return;
        }
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
          const result = await sendLifecycleEmailJobs({
            supabase,
            showId: prompt.entry.showId,
            jobIds: [jobId],
            subject: values.subject,
            body: values.body,
            secretaryNote: values.secretaryNote,
          });
          // The send handler answers 200 even when delivery fails; the job stays on the list.
          if (result.failed > 0) {
            toast.error(
              "The decision email couldn't be sent. It's still on the list to send again."
            );
          } else {
            toast.success(
              prompt.correctionForJobId ? 'Correction email sent' : 'Decision email sent'
            );
          }
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
    statusMap: statusQuery.data ?? EMPTY_STATUS_MAP,
    decisionEmailPlan,
    openDecisionPrompt,
    sendDecisionEmail,
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
