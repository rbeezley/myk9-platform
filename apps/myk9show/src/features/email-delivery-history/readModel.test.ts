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

  it('labels show message emails plainly', () => {
    const row = normalizeEmailDeliveryRow({
      id: 'attempt-2',
      show_id: 'show-1',
      source_kind: 'show_message',
      lifecycle_step_type: null,
      related_id: 'msg-1',
      recipient_name: null,
      recipient_email: 'a@example.com',
      attempted_at: '2026-11-04T12:00:00Z',
      status_updated_at: null,
      delivery_status: 'sent',
      failure_summary: null,
    });
    expect(row.typeLabel).toBe('Show message');
  });

  it.each([
    ['registration_confirmation', 'Receipt'],
    ['heritage_confirmation', 'Full confirmation'],
    ['show_reminder', 'Reminder'],
  ])('labels the exhibitor %s email as her own email names it (MYK9-1999)', (kind, label) => {
    const row = normalizeEmailDeliveryRow({
      id: `attempt-${kind}`,
      show_id: 'show-1',
      source_kind: kind,
      lifecycle_step_type: null,
      related_id: 'entry-1',
      recipient_name: 'Ada Lovelace',
      recipient_email: 'ada@example.com',
      attempted_at: '2026-11-20T15:00:00Z',
      status_updated_at: null,
      delivery_status: 'sent',
      failure_summary: null,
    });
    expect(row.typeLabel).toBe(label);
  });

  it('labels the automatic show-changed email by what happened to the show', () => {
    const row = normalizeEmailDeliveryRow({
      id: 'attempt-3',
      show_id: 'show-1',
      source_kind: 'lifecycle',
      lifecycle_step_type: 'show_changed',
      related_id: 'job-1',
      recipient_name: 'Ada Lovelace',
      recipient_email: 'ada@example.com',
      attempted_at: '2026-11-17T12:00:00Z',
      status_updated_at: null,
      delivery_status: 'sent',
      failure_summary: null,
    });
    expect(row.typeLabel).toBe('Date or venue changed');
  });

  it('labels the automatic judge-changed email in plain words', () => {
    const row = normalizeEmailDeliveryRow({
      id: 'attempt-4',
      show_id: 'show-1',
      source_kind: 'lifecycle',
      lifecycle_step_type: 'judge_changed',
      related_id: 'job-2',
      recipient_name: 'Ada Lovelace',
      recipient_email: 'ada@example.com',
      attempted_at: '2026-11-17T12:00:00Z',
      status_updated_at: null,
      delivery_status: 'sent',
      failure_summary: null,
    });
    expect(row.typeLabel).toBe('Judge changed');
  });

  it('labels the automatic entry-changed email in plain words', () => {
    const row = normalizeEmailDeliveryRow({
      id: 'attempt-5',
      show_id: 'show-1',
      source_kind: 'lifecycle',
      lifecycle_step_type: 'entry_changed',
      related_id: 'job-3',
      recipient_name: 'Ada Lovelace',
      recipient_email: 'ada@example.com',
      attempted_at: '2026-11-17T12:00:00Z',
      status_updated_at: null,
      delivery_status: 'sent',
      failure_summary: null,
    });
    expect(row.typeLabel).toBe('Entry changed');
  });

  it('routes failures to the existing owner surface', () => {
    expect(getEmailRecoveryHref('registration_confirmation', 'show-1')).toBe(
      '/shows/show-1/entries'
    );
    expect(getEmailRecoveryHref('lifecycle', 'show-1')).toBe(
      '/secretary/messages?showId=show-1&view=email#scheduled-emails'
    );
    expect(getEmailRecoveryHref('waitlist_notification', 'show-1')).toBe(
      '/shows/show-1/entries?tab=waitlist'
    );
    expect(getEmailRecoveryHref('registry_results_submission', 'show-1')).toBe(
      '/shows/show-1/results?step=submit'
    );
  });
});
