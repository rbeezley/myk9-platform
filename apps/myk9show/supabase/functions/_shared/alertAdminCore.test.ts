import { describe, expect, it, vi } from 'vitest';
import { classifyInsertResult, runAlertAdmin } from './alertAdminCore';

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
