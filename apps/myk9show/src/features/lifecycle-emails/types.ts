export const LIFECYCLE_EMAIL_STEP_TYPES = [
  'accepted',
  'waitlisted',
  'two_week_reminder',
  'day_before_reminder',
  'results_available',
] as const;

export type LifecycleEmailStepType = (typeof LIFECYCLE_EMAIL_STEP_TYPES)[number];

export const LIFECYCLE_EMAIL_JOB_STATUSES = [
  'ready',
  'sent',
  'failed',
  'skipped',
  'dismissed',
] as const;

export type LifecycleEmailJobStatus = (typeof LIFECYCLE_EMAIL_JOB_STATUSES)[number];

export const LIFECYCLE_EMAIL_ATTEMPT_STATUSES = [
  'sent',
  'failed',
  'delivered',
  'bounced',
  'complained',
  'delayed',
] as const;

export type LifecycleEmailAttemptStatus = (typeof LIFECYCLE_EMAIL_ATTEMPT_STATUSES)[number];

export const LIFECYCLE_EMAIL_RECIPIENT_SCOPES = ['entry', 'enrollment', 'show_recipient'] as const;

export type LifecycleEmailRecipientScope = (typeof LIFECYCLE_EMAIL_RECIPIENT_SCOPES)[number];

export interface LifecycleEmailIdempotencyInput {
  showId: string;
  stepType: LifecycleEmailStepType;
  recipientScope: LifecycleEmailRecipientScope;
  entryId?: string | null;
  enrollmentId?: string | null;
  recipientPersonId?: string | null;
  recipientEmail?: string | null;
  batchKey?: string | null;
  correctionForJobId?: string | null;
}

export function buildLifecycleEmailIdempotencyKey(input: LifecycleEmailIdempotencyInput): string {
  const recipientKey =
    input.entryId ??
    input.enrollmentId ??
    input.recipientPersonId ??
    input.recipientEmail?.trim().toLowerCase() ??
    'show';

  return [
    'show-lifecycle-email',
    input.showId,
    input.stepType,
    input.recipientScope,
    input.batchKey?.trim() || 'single',
    recipientKey,
    input.correctionForJobId ? `correction:${input.correctionForJobId}` : 'original',
  ].join(':');
}
