import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));

import { emailJudgeRecord, JudgeRecordEmailError, previewJudgeRecipient } from './emailJudgeRecord';

const base = { showId: 'show-1', judgeId: 'judge-1', day: '2026-12-07' };

function httpError(code: string) {
  return { context: new Response(JSON.stringify({ error: 'x', code }), { status: 422 }) };
}

describe('emailJudgeRecord', () => {
  beforeEach(() => invoke.mockReset());

  it('asks the server who would receive it, naming the judge and the day and no address', async () => {
    invoke.mockResolvedValue({
      data: { judgeName: 'Pat Donovan', email: 'pat@example.com', reason: null },
      error: null,
    });

    expect(await previewJudgeRecipient(base)).toEqual({
      judgeName: 'Pat Donovan',
      email: 'pat@example.com',
      reason: null,
    });
    expect(invoke).toHaveBeenCalledWith('send-judge-record', {
      body: { action: 'preview', ...base },
    });
  });

  it('sends the PDF with the judge and the day, and never a recipient', async () => {
    invoke.mockResolvedValue({
      data: {
        judgeName: 'Pat Donovan',
        email: 'pat@example.com',
        alreadySent: false,
        sentAt: null,
        linkExpiresAt: '2027-01-06T00:00:00.000Z',
      },
      error: null,
    });

    const result = await emailJudgeRecord({ ...base, bytes: new Uint8Array([37, 80, 68, 70, 45]) });

    const body = invoke.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body).toEqual({ action: 'send', ...base, pdfBase64: btoa('%PDF-') });
    for (const key of ['to', 'cc', 'recipients', 'recipientEmails', 'replyTo', 'email']) {
      expect(body).not.toHaveProperty(key);
    }
    expect(result).toMatchObject({ email: 'pat@example.com', alreadySent: false });
  });

  it('sends again on purpose with an attempt id of its own', async () => {
    invoke.mockResolvedValue({
      data: { judgeName: 'P', email: 'p@example.com', linkExpiresAt: 'x' },
      error: null,
    });

    await emailJudgeRecord({ ...base, bytes: new Uint8Array([1]), sendAgain: true });

    expect(invoke.mock.calls[0]![1].body).toMatchObject({ sendAgain: true });
    expect(typeof invoke.mock.calls[0]![1].body.attemptId).toBe('string');
  });

  it('words a judge with no email as a download', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError('judge_has_no_email') });

    await expect(emailJudgeRecord({ ...base, bytes: new Uint8Array([1]) })).rejects.toMatchObject({
      code: 'judge_has_no_email',
      message: 'This judge has no email on file. Save the PDF and pass it on.',
    });
  });

  it('words any other failure as save the PDF', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('network') });

    const error = await emailJudgeRecord({ ...base, bytes: new Uint8Array([1]) }).catch(e => e);
    expect(error).toBeInstanceOf(JudgeRecordEmailError);
    expect(error.code).toBe('failed');
  });
});
