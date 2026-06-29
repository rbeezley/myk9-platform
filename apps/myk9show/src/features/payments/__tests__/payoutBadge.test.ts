import { describe, it, expect } from 'vitest';
import { resolvePayoutBadge } from '../payoutBadge';

const row = (status: string, failure_reason: string | null = null) =>
  ({ status, failure_reason }) as Parameters<typeof resolvePayoutBadge>[0];

describe('resolvePayoutBadge', () => {
  it('completed → green "Paid" regardless of account state', () => {
    expect(resolvePayoutBadge(row('completed'), true)).toEqual({
      label: 'Paid',
      variant: 'default',
      className: 'bg-success text-success-foreground hover:bg-success',
    });
    expect(resolvePayoutBadge(row('completed'), false).label).toBe('Paid');
  });

  it('processing → "Sending"', () => {
    expect(resolvePayoutBadge(row('processing'), true)).toEqual({
      label: 'Sending',
      variant: 'secondary',
      className: '',
    });
  });

  describe('pending is context-dependent on payoutsEnabled', () => {
    it('enabled club → "Scheduled" (queued for the next daily run)', () => {
      expect(resolvePayoutBadge(row('pending'), true)).toEqual({
        label: 'Scheduled',
        variant: 'secondary',
        className: '',
      });
    });

    it('not-enabled club → "Waiting for account" (no bank account yet)', () => {
      expect(resolvePayoutBadge(row('pending'), false)).toEqual({
        label: 'Waiting for account',
        variant: 'secondary',
        className: '',
      });
    });
  });

  describe('failed splits benign (auto-retry) from hard (needs a human)', () => {
    it.each([
      'insufficient_balance: balance too low',
      'stale_processing',
      'entries_load_failed_post_claim',
    ])('benign reason %s → secondary "Retrying"', reason => {
      expect(resolvePayoutBadge(row('failed', reason), true)).toEqual({
        label: 'Retrying',
        variant: 'secondary',
        className: '',
      });
    });

    it('hard Stripe error → red "Needs attention"', () => {
      expect(resolvePayoutBadge(row('failed', 'No such external account'), true)).toEqual({
        label: 'Needs attention',
        variant: 'destructive',
        className: '',
      });
    });

    it('a failed row with no reason is treated as needs-attention (anomalous)', () => {
      expect(resolvePayoutBadge(row('failed', null), true).label).toBe('Needs attention');
      expect(resolvePayoutBadge(row('failed', null), true).variant).toBe('destructive');
    });
  });

  it('unknown status falls back to the raw status string, secondary', () => {
    expect(resolvePayoutBadge(row('weird-future-status'), true)).toEqual({
      label: 'weird-future-status',
      variant: 'secondary',
      className: '',
    });
  });
});
