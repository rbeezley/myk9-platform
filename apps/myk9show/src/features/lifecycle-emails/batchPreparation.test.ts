import { describe, expect, it } from 'vitest';
import { prepareReviewedLifecycleEmailBatch } from './batchPreparation';

const recipient = {
  enrollmentId: 'reg-1',
  recipientEmail: 'jamie@example.com',
  recipientName: 'Jamie',
  dogName: 'Willow',
  className: 'Advanced Interior',
};

describe('reviewed lifecycle email batch preparation', () => {
  it('prepares a two-week reminder as due without sending automatically', () => {
    const batch = prepareReviewedLifecycleEmailBatch({
      showId: 'show-1',
      startDate: '2026-09-15',
      timezone: 'America/Chicago',
      stepType: 'two_week_reminder',
      isStepEnabled: true,
      now: new Date('2026-09-01T15:00:00Z'),
      recipients: [recipient],
    });

    expect(batch.isDue).toBe(true);
    expect(batch.canReview).toBe(true);
    expect(batch.requiresSendNow).toBe(true);
    expect(batch.recipients[0].idempotencyKey).toContain('two_week_reminder');
  });

  it('keeps a future day-before reminder unavailable for review', () => {
    const batch = prepareReviewedLifecycleEmailBatch({
      showId: 'show-1',
      startDate: '2026-09-15',
      timezone: 'America/Chicago',
      stepType: 'day_before_reminder',
      isStepEnabled: true,
      now: new Date('2026-09-10T15:00:00Z'),
      recipients: [recipient],
    });

    expect(batch.isDue).toBe(false);
    expect(batch.canReview).toBe(false);
  });

  it('requires secretary results-ready confirmation before results review', () => {
    const batch = prepareReviewedLifecycleEmailBatch({
      showId: 'show-1',
      startDate: '2026-09-15',
      endDate: '2026-09-16',
      timezone: 'America/Chicago',
      stepType: 'results_available',
      isStepEnabled: true,
      now: new Date('2026-09-17T15:00:00Z'),
      resultsReadyConfirmed: false,
      recipients: [recipient],
    });

    expect(batch.isDue).toBe(true);
    expect(batch.canReview).toBe(false);
    expect(batch.warnings).toContain('Results need secretary confirmation before review.');
  });

  it('does not prepare disabled steps for review', () => {
    const batch = prepareReviewedLifecycleEmailBatch({
      showId: 'show-1',
      startDate: '2026-09-15',
      timezone: 'America/Chicago',
      stepType: 'two_week_reminder',
      isStepEnabled: false,
      now: new Date('2026-09-01T15:00:00Z'),
      recipients: [recipient],
    });

    expect(batch.canReview).toBe(false);
    expect(batch.warnings).toContain('This step is disabled.');
  });

  it('skips recipients with missing email and keeps optional-data warnings', () => {
    const batch = prepareReviewedLifecycleEmailBatch({
      showId: 'show-1',
      startDate: '2026-09-15',
      timezone: 'America/Chicago',
      stepType: 'two_week_reminder',
      isStepEnabled: true,
      now: new Date('2026-09-01T15:00:00Z'),
      recipients: [{ enrollmentId: 'reg-2', recipientName: 'Casey' }],
    });

    expect(batch.recipients[0]).toMatchObject({
      recipientEmail: null,
      skipped: true,
      warnings: ['Missing email address.', 'Class detail is missing.'],
    });
  });
});
