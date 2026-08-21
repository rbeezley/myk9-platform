import { describe, it, expect } from 'vitest';
import { NEUTRAL_STATUS_CHIP, WAITING_STATUS_CHIP } from '@/components/ui/statusChip';
import { resolvePayoutBadge } from '../payoutBadge';

const row = (status: string, failure_reason: string | null = null) =>
  ({ status, failure_reason }) as Parameters<typeof resolvePayoutBadge>[0];

describe('resolvePayoutBadge', () => {
  it('completed → green "Paid" regardless of account state', () => {
    expect(resolvePayoutBadge(row('completed'), 'enabled')).toEqual({
      label: 'Paid',
      variant: 'default',
      className: 'bg-success text-success-foreground hover:bg-success',
    });
    expect(resolvePayoutBadge(row('completed'), 'not-enabled').label).toBe('Paid');
  });

  it('processing → "Sending"', () => {
    expect(resolvePayoutBadge(row('processing'), 'enabled')).toEqual({
      label: 'Sending',
      variant: 'secondary',
      className: NEUTRAL_STATUS_CHIP,
    });
  });

  describe('pending is context-dependent on payoutsEnabled', () => {
    it('enabled club → "Scheduled" (queued for the next daily run)', () => {
      expect(resolvePayoutBadge(row('pending'), 'enabled')).toEqual({
        label: 'Scheduled',
        variant: 'secondary',
        className: NEUTRAL_STATUS_CHIP,
      });
    });

    it('not-enabled club → "Waiting for account" (no bank account yet)', () => {
      expect(resolvePayoutBadge(row('pending'), 'not-enabled')).toEqual({
        label: 'Waiting for account',
        variant: 'secondary',
        className: WAITING_STATUS_CHIP,
      });
    });
  });

  describe('failed splits benign (auto-retry) from hard (needs a human)', () => {
    it.each([
      'insufficient_balance: balance too low',
      'stale_processing',
      'entries_load_failed_post_claim',
    ])('benign reason %s → secondary "Retrying"', reason => {
      expect(resolvePayoutBadge(row('failed', reason), 'enabled')).toEqual({
        label: 'Retrying',
        variant: 'secondary',
        className: NEUTRAL_STATUS_CHIP,
      });
    });

    it('hard Stripe error → red "Needs attention"', () => {
      expect(resolvePayoutBadge(row('failed', 'No such external account'), 'enabled')).toEqual({
        label: 'Needs attention',
        variant: 'destructive',
        // The one state a treasurer must act on keeps the destructive variant's
        // own colours; it is the only badge here that should look alarming.
        className: '',
      });
    });

    it('a failed row with no reason is treated as needs-attention (anomalous)', () => {
      expect(resolvePayoutBadge(row('failed', null), 'enabled').label).toBe('Needs attention');
      expect(resolvePayoutBadge(row('failed', null), 'enabled').variant).toBe('destructive');
    });
  });

  it('unknown status says so instead of leaking the raw database enum', () => {
    expect(resolvePayoutBadge(row('weird-future-status'), 'enabled')).toEqual({
      label: 'Status unavailable',
      variant: 'secondary',
      className: NEUTRAL_STATUS_CHIP,
    });
  });
});
