// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  type AlertEmailDeps,
  sendAlertEmailWith,
  DEFAULT_ALERT_SUBJECT_PREFIX,
  alertWasEmailed,
  buildAlertRow,
  classifyInsertResult,
  runAlertAdmin,
} from './alertAdminCore';

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
    expect(result).toEqual({
      insertOutcome: 'deduped',
      emailAttempted: false,
      emailError: null,
      emailSent: false,
    });
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

  it('reports a skipped send (no key) as not sent, and never as emailed', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sendEmail = vi.fn().mockResolvedValue({ sent: false });

    const result = await runAlertAdmin('subject', { insert, sendEmail });

    expect(result.emailSent).toBe(false);
    expect(alertWasEmailed(result)).toBe(false);
  });

  it('counts a real send on a saved row as emailed', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });

    expect(alertWasEmailed(await runAlertAdmin('subject', { insert, sendEmail }))).toBe(true);
  });

  it('does not count an email sent while the insert failed (no row to stamp)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'nope' } });
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });

    const result = await runAlertAdmin('subject', { insert, sendEmail });

    expect(result.emailSent).toBe(true);
    expect(alertWasEmailed(result)).toBe(false);
  });

  it('does not count a send that threw', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sendEmail = vi.fn().mockRejectedValue(new Error('resend down'));

    expect(alertWasEmailed(await runAlertAdmin('subject', { insert, sendEmail }))).toBe(false);
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

  it('sends no email for a row the database stored already resolved (MYK9-2456)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null, storedResolved: true });
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });

    const result = await runAlertAdmin('subject', { insert, sendEmail });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      insertOutcome: 'inserted',
      emailAttempted: false,
      emailError: null,
      emailSent: false,
      storedResolved: true,
    });
    expect(alertWasEmailed(result)).toBe(false);
  });

  it('emails as before when the stored row is open, and adds no field to the result', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null, storedResolved: false });
    const sendEmail = vi.fn().mockResolvedValue({ sent: true });

    const result = await runAlertAdmin('subject', { insert, sendEmail });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      insertOutcome: 'inserted',
      emailAttempted: true,
      emailError: null,
      emailSent: true,
    });
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

describe('sendAlertEmailWith (MYK9-2301)', () => {
  const okPost = () => vi.fn<AlertEmailDeps['post']>(async () => ({ ok: true, status: 200 }));
  const sentBody = (post: ReturnType<typeof okPost>) =>
    JSON.parse(post.mock.calls.at(0)?.[0].body ?? '{}');

  it('skips and reports not sent when no key is configured', async () => {
    const post = okPost();
    const log = vi.fn();
    await expect(
      sendAlertEmailWith(
        { apiKey: undefined, to: 'ops@example.com', post, log },
        'Subj',
        '<p>x</p>'
      )
    ).resolves.toEqual({ sent: false });
    expect(post).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Alert email skipped (no RESEND_API_KEY): Subj');
  });

  it('sends with the payments prefix by default and reports sent', async () => {
    const post = okPost();
    await expect(
      sendAlertEmailWith({ apiKey: 'k', to: 'ops@example.com', post, log: vi.fn() }, 'Subj', 'h')
    ).resolves.toEqual({ sent: true });
    const body = sentBody(post);
    expect(body.subject).toBe(`${DEFAULT_ALERT_SUBJECT_PREFIX} Subj`);
    expect(DEFAULT_ALERT_SUBJECT_PREFIX).toBe('[myK9Show payments]');
    expect(body.to).toBe('ops@example.com');
  });

  it('uses the prefix it is given', async () => {
    const post = okPost();
    await sendAlertEmailWith(
      { apiKey: 'k', to: 'ops@example.com', post, log: vi.fn() },
      'Subj',
      'h',
      '[myK9Show platform]'
    );
    expect(sentBody(post).subject).toBe('[myK9Show platform] Subj');
  });

  it('throws when the provider refuses the email', async () => {
    const post = vi.fn<AlertEmailDeps['post']>(async () => ({ ok: false, status: 500 }));
    await expect(
      sendAlertEmailWith({ apiKey: 'k', to: 'ops@example.com', post, log: vi.fn() }, 'Subj', 'h')
    ).rejects.toThrow('Alert email failed (500): Subj');
  });
});
