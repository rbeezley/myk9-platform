// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildAlertRow, classifyInsertResult, runAlertAdmin } from './alertAdminCore';

describe('buildAlertRow', () => {
  it('falls back to { html } as detail when opts.detail is absent (legacy no-opts callers)', () => {
    const html = '<p>Entry 123 refund failed for payment intent pi_abc</p>';

    const row = buildAlertRow('Refund failed', html);

    expect(row.detail).toEqual({ html });
  });

  it('persists an explicit detail verbatim, without merging in html', () => {
    const html = '<p>ignored for detail purposes</p>';
    const detail = { entryId: 'entry-1', paymentIntentId: 'pi_abc' };

    const row = buildAlertRow('Refund failed', html, { detail });

    expect(row.detail).toEqual(detail);
    expect(row.detail).not.toHaveProperty('html');
  });

  it('defaults source/severity/dedupe_key and carries subject as title', () => {
    const row = buildAlertRow('Something broke', '<p>x</p>');

    expect(row.source).toBe('unspecified');
    expect(row.severity).toBe('error');
    expect(row.title).toBe('Something broke');
    expect(row.dedupe_key).toBeNull();
  });

  it('carries opts.source, opts.severity, and opts.dedupeKey into the row', () => {
    const row = buildAlertRow('Something broke', '<p>x</p>', {
      source: 'stripe-webhook',
      severity: 'warn',
      dedupeKey: 'entry-claim-failed-sess_123',
    });

    expect(row.source).toBe('stripe-webhook');
    expect(row.severity).toBe('warn');
    expect(row.dedupe_key).toBe('entry-claim-failed-sess_123');
  });
});

describe('classifyInsertResult', () => {
  it('classifies a clean insert as inserted', () => {
    expect(classifyInsertResult({ error: null })).toBe('inserted');
  });

  it('classifies a unique-violation (23505) on the dedupe index as a benign dedupe hit', () => {
    expect(classifyInsertResult({ error: { code: '23505', message: 'duplicate key' } })).toBe(
      'deduped'
    );
  });

  it('classifies any other error as a real insert failure', () => {
    expect(classifyInsertResult({ error: { code: '42501', message: 'permission denied' } })).toBe(
      'insert_failed'
    );
    expect(classifyInsertResult({ error: { message: 'network error' } })).toBe('insert_failed');
  });
});

describe('runAlertAdmin', () => {
  it('skips duplicate email only when explicitly requested', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'dup' } });
    const sendEmail = vi.fn();
    const result = await runAlertAdmin('subject', {
      insert,
      sendEmail,
      skipEmailOnDuplicate: true,
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ insertOutcome: 'deduped', emailAttempted: false, emailError: null });
  });

  it('still attempts email on insert failure when duplicate skipping is enabled', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'db down' } });
    const sendEmail = vi.fn();
    await runAlertAdmin('subject', { insert, sendEmail, skipEmailOnDuplicate: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('attempts email even when the insert fails (insert-fails-email-succeeds)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'db down' } });
    const sendEmail = vi.fn().mockResolvedValue(undefined);

    const result = await runAlertAdmin('subject', { insert, sendEmail });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.insertOutcome).toBe('insert_failed');
    expect(result.emailError).toBeNull();
  });

  it('still reports the insert outcome when email fails (insert-succeeds-email-fails)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sendEmail = vi.fn().mockRejectedValue(new Error('resend down'));

    const result = await runAlertAdmin('subject', { insert, sendEmail });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.insertOutcome).toBe('inserted');
    expect(result.emailError).toBeInstanceOf(Error);
  });

  it('never throws even when both insert and email fail', async () => {
    const insert = vi.fn().mockRejectedValue(new Error('insert threw'));
    const sendEmail = vi.fn().mockRejectedValue(new Error('email threw'));

    await expect(runAlertAdmin('subject', { insert, sendEmail })).resolves.toBeDefined();
  });

  it('still calls sendEmail when RESEND_API_KEY is unset (caller-provided no-op skip is still an attempt)', async () => {
    // The Deno-only alertAdmin.ts wraps a "no RESEND_API_KEY" case as a
    // sendEmail() that resolves without sending. runAlertAdmin does not know
    // or care why sendEmail resolved — persistence must not depend on it.
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sendEmail = vi.fn().mockResolvedValue(undefined); // simulates "skipped, no key"

    const result = await runAlertAdmin('subject', { insert, sendEmail });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(result.insertOutcome).toBe('inserted');
  });

  it('treats a dedupe unique-violation as benign and still attempts email', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'dup' } });
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    const result = await runAlertAdmin('subject', { insert, sendEmail, log });

    expect(result.insertOutcome).toBe('deduped');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('deduped'));
  });

  it('logs (not throws) on a real insert failure', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'nope' } });
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const logError = vi.fn();

    const result = await runAlertAdmin('subject', { insert, sendEmail, logError });

    expect(result.insertOutcome).toBe('insert_failed');
    expect(logError).toHaveBeenCalled();
  });
});
