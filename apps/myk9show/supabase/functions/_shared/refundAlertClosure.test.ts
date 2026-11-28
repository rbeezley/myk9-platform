import { describe, expect, it, vi } from 'vitest';
import { closeAwaitingApprovalAlert, type ResolveAlerts } from './refundAlertClosure';

const NOW = new Date('2026-11-28T15:04:05.000Z');

function resolver() {
  return vi.fn<ResolveAlerts>(async () => 1);
}

describe('closeAwaitingApprovalAlert', () => {
  it.each([200, 202])('an approval that issued a refund (%i) closes the alert', async status => {
    const resolveAlerts = resolver();
    await expect(
      closeAwaitingApprovalAlert(resolveAlerts, {
        requestId: 'rr-1',
        decision: 'approved',
        httpStatus: status,
        now: NOW,
      })
    ).resolves.toBe(1);
    expect(resolveAlerts).toHaveBeenCalledWith(
      'stripe-webhook',
      { dedupeKey: 'refund-request-rr-1' },
      'Approved by a site admin; the refund was issued at 2026-11-28T15:04:05.000Z.'
    );
  });

  it('a resolution without refund closes the alert', async () => {
    const resolveAlerts = resolver();
    await closeAwaitingApprovalAlert(resolveAlerts, {
      requestId: 'rr-2',
      decision: 'resolved_without_refund',
      httpStatus: 200,
      now: NOW,
    });
    expect(resolveAlerts).toHaveBeenCalledWith(
      'stripe-webhook',
      { dedupeKey: 'refund-request-rr-2' },
      'Resolved without refund by a site admin at 2026-11-28T15:04:05.000Z.'
    );
  });

  it.each([404, 409, 500, 502, 503])(
    'an approval that issued no refund (%i) leaves the alert open',
    async status => {
      const resolveAlerts = resolver();
      await expect(
        closeAwaitingApprovalAlert(resolveAlerts, {
          requestId: 'rr-1',
          decision: 'approved',
          httpStatus: status,
          now: NOW,
        })
      ).resolves.toBe(0);
      expect(resolveAlerts).not.toHaveBeenCalled();
    }
  );

  it.each([400, 404, 409, 500])('a refused resolution (%i) leaves the alert open', async status => {
    const resolveAlerts = resolver();
    await closeAwaitingApprovalAlert(resolveAlerts, {
      requestId: 'rr-1',
      decision: 'resolved_without_refund',
      httpStatus: status,
      now: NOW,
    });
    expect(resolveAlerts).not.toHaveBeenCalled();
  });

  it('a failing resolve never throws into the approval', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      closeAwaitingApprovalAlert(
        async () => {
          throw new Error('db down');
        },
        { requestId: 'rr-1', decision: 'approved', httpStatus: 202, now: NOW }
      )
    ).resolves.toBe(0);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
