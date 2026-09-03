// Deferred groundwork: this is intentionally not wired into a producer yet.
// Keep it for the scheduled batch follow-up (MYK9-228); MYK9-318 hides the
// corresponding controls until a cron/job producer creates these rows.
import { calculateLifecycleEmailDueAt } from './schedule';
import { buildLifecycleEmailIdempotencyKey, type LifecycleEmailStepType } from './types';

export type ReviewedBatchStepType =
  'two_week_reminder' | 'day_before_reminder' | 'results_available';

export interface LifecycleBatchRecipientSource {
  enrollmentId: string;
  recipientEmail?: string | null;
  recipientName?: string | null;
  dogName?: string | null;
  className?: string | null;
  armbandNumber?: string | null;
}

export interface LifecycleBatchPreparationInput {
  showId: string;
  startDate: string;
  endDate?: string | null;
  timezone: string;
  stepType: ReviewedBatchStepType;
  isStepEnabled: boolean;
  recipients: readonly LifecycleBatchRecipientSource[];
  now?: Date;
  resultsReadyConfirmed?: boolean;
}

export interface PreparedLifecycleBatchRecipient {
  enrollmentId: string;
  recipientEmail: string | null;
  recipientName: string | null;
  idempotencyKey: string;
  warnings: string[];
  skipped: boolean;
}

export interface PreparedLifecycleEmailBatch {
  showId: string;
  stepType: ReviewedBatchStepType;
  batchKey: string;
  dueAt: Date;
  isDue: boolean;
  requiresSendNow: true;
  canReview: boolean;
  recipients: PreparedLifecycleBatchRecipient[];
  warnings: string[];
}

export function prepareReviewedLifecycleEmailBatch(
  input: LifecycleBatchPreparationInput
): PreparedLifecycleEmailBatch {
  const now = input.now ?? new Date();
  const dueAt = calculateLifecycleEmailDueAt(input.stepType, {
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    timezone: input.timezone,
  });
  const isDue = now.getTime() >= dueAt.getTime();
  const batchKey = `${input.showId}:${input.stepType}:${dueAt.toISOString().slice(0, 10)}`;
  const warnings: string[] = [];

  if (!input.isStepEnabled) warnings.push('This step is disabled.');
  if (input.stepType === 'results_available' && !input.resultsReadyConfirmed) {
    warnings.push('Results need secretary confirmation before review.');
  }

  return {
    showId: input.showId,
    stepType: input.stepType,
    batchKey,
    dueAt,
    isDue,
    requiresSendNow: true,
    canReview:
      input.isStepEnabled &&
      isDue &&
      (input.stepType !== 'results_available' || input.resultsReadyConfirmed === true),
    recipients: input.recipients.map(recipient => prepareRecipient(input, batchKey, recipient)),
    warnings,
  };
}

export function isReviewedBatchStepType(
  stepType: LifecycleEmailStepType
): stepType is ReviewedBatchStepType {
  return (
    stepType === 'two_week_reminder' ||
    stepType === 'day_before_reminder' ||
    stepType === 'results_available'
  );
}

function prepareRecipient(
  input: LifecycleBatchPreparationInput,
  batchKey: string,
  recipient: LifecycleBatchRecipientSource
): PreparedLifecycleBatchRecipient {
  const warnings: string[] = [];
  const email = recipient.recipientEmail?.trim() || null;
  if (!email) warnings.push('Missing email address.');
  if (!recipient.className) warnings.push('Class detail is missing.');

  return {
    enrollmentId: recipient.enrollmentId,
    recipientEmail: email,
    recipientName: recipient.recipientName?.trim() || null,
    idempotencyKey: buildLifecycleEmailIdempotencyKey({
      showId: input.showId,
      stepType: input.stepType,
      recipientScope: 'enrollment',
      enrollmentId: recipient.enrollmentId,
      batchKey,
    }),
    warnings,
    skipped: !email,
  };
}
