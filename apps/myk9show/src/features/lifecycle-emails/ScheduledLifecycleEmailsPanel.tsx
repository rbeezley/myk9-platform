import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchLifecycleEmailJobsForReview,
  fetchShowLifecycleEmailSummary,
  sendLifecycleEmailJobs,
  skipLifecycleEmailJobsForReview,
  updateLifecycleEmailStepEnabled,
  type LifecycleEmailJobReview,
  type LifecycleEmailSupabaseClient,
} from './api';
import type { LifecycleEmailStepSummary } from './readModel';
import type { LifecycleEmailStepType } from './types';

interface ScheduledLifecycleEmailsPanelProps {
  showId: string;
}

const STEP_LABELS: Record<LifecycleEmailStepSummary['stepType'], string> = {
  accepted: 'Accepted entries',
  waitlisted: 'Waitlist entries',
  two_week_reminder: 'Two-week reminder',
  day_before_reminder: 'Day-before reminder',
  results_available: 'Results available',
};

// Reminder/results batches remain deferred until a producer exists (MYK9-318;
// follow-up tracked with the producer work in MYK9-228). Showing their controls
// would imply that enabling them schedules work that currently cannot be created.
const PRODUCER_BACKED_STEP_TYPES = new Set<LifecycleEmailStepSummary['stepType']>([
  'accepted',
  'waitlisted',
]);

const queryKey = (showId: string) => ['show-lifecycle-emails', showId] as const;

export function ScheduledLifecycleEmailsPanel({ showId }: ScheduledLifecycleEmailsPanelProps) {
  const queryClient = useQueryClient();
  const lifecycleClient = supabase as unknown as LifecycleEmailSupabaseClient;
  const [reviewStep, setReviewStep] = useState<LifecycleEmailStepType | null>(null);
  const summaryQuery = useQuery({
    queryKey: queryKey(showId),
    queryFn: () => fetchShowLifecycleEmailSummary({ supabase: lifecycleClient, showId }),
    staleTime: 30_000,
  });
  const updateStep = useMutation({
    mutationFn: (variables: {
      stepType: LifecycleEmailStepSummary['stepType'];
      isEnabled: boolean;
    }) =>
      updateLifecycleEmailStepEnabled({
        supabase: lifecycleClient,
        showId,
        stepType: variables.stepType,
        isEnabled: variables.isEnabled,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey(showId) }),
  });

  return (
    <section id="scheduled-emails" className="border-b bg-background px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold">Scheduled emails</h2>
        </div>
        {summaryQuery.isFetching ? (
          <span className="text-xs text-muted-foreground">Updating...</span>
        ) : null}
      </div>

      {summaryQuery.isError ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Scheduled email status is not available right now.
        </p>
      ) : null}

      <div className="space-y-2">
        {(summaryQuery.data?.steps ?? [])
          .filter(step => PRODUCER_BACKED_STEP_TYPES.has(step.stepType))
          .map(step => (
            <ScheduledEmailStepRow
              key={step.stepType}
              step={step}
              disabled={updateStep.isPending}
              onToggle={isEnabled => updateStep.mutate({ stepType: step.stepType, isEnabled })}
              onReview={() => setReviewStep(step.stepType)}
            />
          ))}
      </div>

      {reviewStep ? (
        <LifecycleBatchReviewDialog
          showId={showId}
          stepType={reviewStep}
          onOpenChange={open => {
            if (!open) setReviewStep(null);
          }}
          onSent={() => {
            setReviewStep(null);
            void queryClient.invalidateQueries({ queryKey: queryKey(showId) });
          }}
        />
      ) : null}
    </section>
  );
}

function ScheduledEmailStepRow({
  step,
  disabled,
  onToggle,
  onReview,
}: {
  step: LifecycleEmailStepSummary;
  disabled: boolean;
  onToggle: (isEnabled: boolean) => void;
  onReview: () => void;
}) {
  const readyLabel = step.readyCount > 0 ? `${step.readyCount} ready` : 'None ready';
  const sentLabel = step.sentCount > 0 ? `${step.sentCount} sent` : null;
  const failedLabel = step.failedCount > 0 ? `${step.failedCount} failed` : null;
  const warningLabel = step.warningCount > 0 ? `${step.warningCount} warning` : null;
  const countLabel = [readyLabel, sentLabel, failedLabel, warningLabel].filter(Boolean).join(' · ');
  const hasReviewableJobs = step.readyCount > 0 || step.failedCount > 0;

  return (
    <div className="rounded-md border border-border/70 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{STEP_LABELS[step.stepType]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{countLabel}</p>
        </div>
        <Switch
          aria-label={`${STEP_LABELS[step.stepType]} enabled`}
          checked={step.isEnabled}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
      </div>
      {hasReviewableJobs ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 w-full"
          onClick={onReview}
        >
          Review
        </Button>
      ) : null}
    </div>
  );
}

function LifecycleBatchReviewDialog({
  showId,
  stepType,
  onOpenChange,
  onSent,
}: {
  showId: string;
  stepType: LifecycleEmailStepType;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}) {
  const lifecycleClient = supabase as unknown as LifecycleEmailSupabaseClient;
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [secretaryNote, setSecretaryNote] = useState<string | null>(null);
  const [excludedJobIds, setExcludedJobIds] = useState<Set<string>>(new Set());
  const jobsQuery = useQuery({
    queryKey: ['show-lifecycle-email-review', showId, stepType],
    queryFn: () =>
      fetchLifecycleEmailJobsForReview({ supabase: lifecycleClient, showId, stepType }),
  });
  const sendMutation = useMutation({
    mutationFn: async (input: { sendJobs: LifecycleEmailJobReview[]; skippedJobIds: string[] }) => {
      await skipLifecycleEmailJobsForReview({
        supabase: lifecycleClient,
        jobIds: input.skippedJobIds,
      });
      if (input.sendJobs.length === 0) return;
      // Only forward text the secretary actually edited. Anything sent here is a
      // BROADCAST override applied to every recipient, so an unedited send must
      // omit it and let each job deliver its own personalised draft (MYK9-315).
      await sendLifecycleEmailJobs({
        supabase,
        showId,
        jobIds: input.sendJobs.map(job => job.id),
        subject,
        body,
        secretaryNote,
      });
    },
    onSuccess: onSent,
  });
  const jobs = jobsQuery.data ?? [];
  const selectedSubject = subject ?? jobs[0]?.subject ?? '';
  const selectedBody = body ?? jobs[0]?.body ?? '';
  const selectedNote = secretaryNote ?? jobs[0]?.secretaryNote ?? '';
  const readyJobs = jobs.filter(job => job.status === 'ready');
  const failedJobs = jobs.filter(job => job.status === 'failed');
  const reviewableJobs = [...readyJobs, ...failedJobs];
  const sendableJobs = reviewableJobs.filter(job => job.recipientEmail);
  const selectedJobs = sendableJobs.filter(job => !excludedJobIds.has(job.id));
  const skippedJobIds = reviewableJobs
    .filter(job => !job.recipientEmail || excludedJobIds.has(job.id))
    .map(job => job.id);
  const previewJob = sendableJobs[0] ?? jobs[0] ?? null;
  const hasEdit = subject !== null || body !== null || secretaryNote !== null;
  const overriddenCount = selectedJobs.length;

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{STEP_LABELS[stepType]} review</DialogTitle>
        </DialogHeader>

        {jobsQuery.isError ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Recipient previews are not available right now.
          </p>
        ) : null}
        {failedJobs.length > 0 ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {failedJobs.length} failed {failedJobs.length === 1 ? 'recipient is' : 'recipients are'}{' '}
            ready to retry.
          </p>
        ) : null}

        <div className="space-y-3">
          {hasEdit && overriddenCount > 1 ? (
            <p
              role="alert"
              className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              This text will replace {overriddenCount} personalised drafts. Every selected recipient
              gets exactly what is written below.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="batch-email-subject">Subject</Label>
            <Textarea
              id="batch-email-subject"
              value={selectedSubject}
              onChange={event => setSubject(event.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-email-body">Message</Label>
            <Textarea
              id="batch-email-body"
              value={selectedBody}
              onChange={event => setBody(event.target.value)}
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch-email-note">Secretary note</Label>
            <Textarea
              id="batch-email-note"
              value={selectedNote}
              onChange={event => setSecretaryNote(event.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-md border">
            {jobsQuery.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading recipients...</p>
            ) : jobs.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No ready recipients.</p>
            ) : (
              jobs.map(job => (
                <LifecycleBatchRecipientRow
                  key={job.id}
                  job={job}
                  included={!excludedJobIds.has(job.id)}
                  onIncludedChange={included => {
                    setExcludedJobIds(current => {
                      const next = new Set(current);
                      if (included) next.delete(job.id);
                      else next.add(job.id);
                      return next;
                    });
                  }}
                />
              ))
            )}
          </div>

          {previewJob ? (
            <div className="rounded-md border bg-background p-3">
              <p className="mb-2 text-sm font-medium">
                Preview for {previewJob.recipientName || previewJob.recipientEmail || 'recipient'}
              </p>
              {!hasEdit && overriddenCount > 1 ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  {overriddenCount - 1 === 1
                    ? 'The other recipient gets their own personalised message.'
                    : `The other ${overriddenCount - 1} recipients each get their own personalised message.`}
                </p>
              ) : null}
              <p className="text-sm font-semibold">{selectedSubject || 'No subject'}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-muted-foreground">
                {selectedBody || 'No message'}
              </pre>
              {selectedNote ? (
                <div className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-950">
                  <p className="font-medium">From the show secretary</p>
                  <p className="mt-1 whitespace-pre-wrap">{selectedNote}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            disabled={
              sendMutation.isPending || (selectedJobs.length === 0 && skippedJobIds.length === 0)
            }
            onClick={() => sendMutation.mutate({ sendJobs: selectedJobs, skippedJobIds })}
          >
            {sendMutation.isPending ? 'Sending...' : 'Send now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LifecycleBatchRecipientRow({
  job,
  included,
  onIncludedChange,
}: {
  job: LifecycleEmailJobReview;
  included: boolean;
  onIncludedChange: (included: boolean) => void;
}) {
  const canSend = Boolean(job.recipientEmail);
  const label = job.recipientName || job.recipientEmail || 'recipient';

  return (
    <div className="border-b px-3 py-2 text-sm last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {canSend ? (
            <Checkbox
              aria-label={`Include ${label}`}
              checked={included}
              onCheckedChange={checked => onIncludedChange(checked === true)}
              className="mt-0.5"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-medium">{job.recipientName || 'Exhibitor'}</p>
            <p className="truncate text-muted-foreground">
              {job.recipientEmail || 'No email on file'}
            </p>
          </div>
        </div>
        {!canSend || !included ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Skipped</span>
        ) : null}
      </div>
      {job.previewWarnings.length > 0 ? (
        <p className="mt-1 text-xs text-amber-700">{job.previewWarnings.join(' ')}</p>
      ) : null}
    </div>
  );
}
