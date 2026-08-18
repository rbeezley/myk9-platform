import { describe, expect, it } from 'vitest';
import {
  getEmailDeliveryStatusPresentation,
  getEmailRecoveryHref,
  normalizeEmailDeliveryRow,
} from './readModel';

describe('email delivery history read model', () => {
  it.each([
    ['delivered', 'Delivered'],
    ['sent', 'Sent — awaiting delivery confirmation'],
    ['bounced', 'Needs attention'],
    ['failed', 'Needs attention'],
    ['complained', 'Needs attention'],
    ['unknown-provider-status', 'Status unavailable'],
  ])('maps %s to truthful status copy', (status, label) => {
    expect(getEmailDeliveryStatusPresentation(status).label).toBe(label);
  });

  it('never treats an unknown provider status as delivered', () => {
    expect(getEmailDeliveryStatusPresentation('future_status')).toMatchObject({
      kind: 'unavailable',
      label: 'Status unavailable',
    });
  });

  it('uses provider update time when available and safe fallback copy for missing recipient', () => {
    const row = normalizeEmailDeliveryRow({
      id: 'attempt-1',
      show_id: 'show-1',
      source_kind: 'heritage_confirmation',
      lifecycle_step_type: null,
      related_id: null,
      recipient_name: null,
      recipient_email: null,
      attempted_at: '2026-08-17T10:00:00Z',
      status_updated_at: '2026-08-17T10:02:00Z',
      delivery_status: 'delivered',
      failure_summary: null,
    });

    expect(row.recipient).toBe('Details unavailable');
    expect(row.relevantAt).toBe('2026-08-17T10:02:00Z');
  });

  it('routes failures to the existing owner surface', () => {
    expect(getEmailRecoveryHref('registration_confirmation', 'show-1')).toBe(
      '/shows/show-1/entry-management'
    );
    expect(getEmailRecoveryHref('lifecycle', 'show-1')).toBe(
      '/secretary/messages?showId=show-1&view=email#scheduled-emails'
    );
    expect(getEmailRecoveryHref('waitlist_notification', 'show-1')).toBe(
      '/shows/show-1/entry-management?tab=waitlist'
    );
    expect(getEmailRecoveryHref('registry_results_submission', 'show-1')).toBe(
      '/shows/show-1/submit-results'
    );
  });
});
