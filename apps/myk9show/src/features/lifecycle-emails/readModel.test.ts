import { describe, expect, it } from 'vitest';
import {
  buildDefaultLifecycleEmailStepSettings,
  buildLifecycleEmailScheduledSummary,
  shouldShowAutomaticReceiptForEntry,
} from './readModel';

describe('lifecycle email read model', () => {
  it('defaults every reviewed lifecycle step to enabled', () => {
    expect(buildDefaultLifecycleEmailStepSettings()).toEqual([
      { stepType: 'accepted', isEnabled: true },
      { stepType: 'waitlisted', isEnabled: true },
      { stepType: 'two_week_reminder', isEnabled: true },
      { stepType: 'day_before_reminder', isEnabled: true },
      { stepType: 'results_available', isEnabled: true },
    ]);
  });

  it('summarizes ready, sent, skipped, failed, dismissed, and warning counts', () => {
    const summary = buildLifecycleEmailScheduledSummary({
      steps: [{ stepType: 'two_week_reminder', isEnabled: false }],
      jobs: [
        { stepType: 'two_week_reminder', status: 'ready', previewWarnings: ['No armband'] },
        { stepType: 'two_week_reminder', status: 'sent' },
        { stepType: 'two_week_reminder', status: 'failed' },
        { stepType: 'two_week_reminder', status: 'skipped' },
        { stepType: 'two_week_reminder', status: 'dismissed' },
      ],
    });

    expect(summary.steps.find(step => step.stepType === 'two_week_reminder')).toMatchObject({
      isEnabled: false,
      readyCount: 1,
      sentCount: 1,
      failedCount: 1,
      skippedCount: 1,
      dismissedCount: 1,
      warningCount: 1,
    });
  });

  it('shows automatic receipts only for online exhibitor submissions', () => {
    expect(
      shouldShowAutomaticReceiptForEntry({
        registrationId: 'reg-online',
        paymentMethod: 'online',
      })
    ).toBe(true);
    expect(
      shouldShowAutomaticReceiptForEntry({
        registrationId: 'reg-mail',
        paymentMethod: 'check',
      })
    ).toBe(false);
    expect(
      shouldShowAutomaticReceiptForEntry({
        registrationId: 'reg-ukc',
        entrySource: 'ukc_online',
      })
    ).toBe(true);
  });

  it('summarizes receipt history for online entries without counting secretary-created rows', () => {
    const summary = buildLifecycleEmailScheduledSummary({
      receiptSources: [
        { registrationId: 'reg-online', paymentMethod: 'online' },
        { registrationId: 'reg-mail', paymentMethod: 'check' },
      ],
      receiptLogs: [
        {
          relatedId: 'reg-online',
          status: 'sent',
          createdAt: '2026-07-08T12:00:00Z',
        },
        {
          relatedId: 'reg-mail',
          status: 'sent',
          createdAt: '2026-07-08T12:01:00Z',
        },
        {
          relatedId: 'reg-online',
          status: 'bounced',
          createdAt: '2026-07-08T12:02:00Z',
        },
      ],
    });

    expect(summary.receipts.sentCount).toBe(1);
    expect(summary.receipts.failedCount).toBe(1);
    expect(summary.receipts.latestSentAtByRegistrationId).toEqual({
      'reg-online': '2026-07-08T12:00:00Z',
    });
  });
});
