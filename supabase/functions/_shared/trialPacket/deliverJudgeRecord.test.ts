// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../http/responses.ts';
import { previewJudgeRecord, sendJudgeRecord } from './deliverJudgeRecord.ts';
import type { PacketShow } from './deliverStoredPacket.ts';
import type { JudgeRecordPayload } from './judgeRecord.ts';

const SHOW: PacketShow = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Heartland Scent Work',
  club_id: 'c0000000-0000-4000-8000-000000000001',
  end_date: '2026-12-08',
};
const JUDGE = 'b0000000-0000-4000-8000-000000000002';
const OTHER_JUDGE = 'b0000000-0000-4000-8000-000000000009';
const DAY = '2026-12-07';
const PDF_BASE64 = btoa('%PDF-1.4 judge record');

interface Options {
  /** Assignment rows by person id. */
  assignments?: Record<string, unknown[]>;
  people?: Record<string, unknown>;
  earlierSend?: { created_at: string } | null;
}

const assignedRow = (date = DAY) => ({
  class_id: 'c1',
  status: 'confirmed',
  class: { deleted_at: null, trial: { date } },
});

function makeStub(options: Options = {}) {
  const {
    assignments = { [JUDGE]: [assignedRow()] },
    people = {
      [JUDGE]: {
        email: 'pat@example.com',
        first_name: 'Pat',
        last_name: 'Donovan',
        deleted_at: null,
      },
    },
    earlierSend = null,
  } = options;
  const events: string[] = [];
  const uploads: { path: string; options: unknown }[] = [];
  const logRows: Record<string, unknown>[] = [];
  const filters: Record<string, unknown[]> = {};

  function query(table: string) {
    const eq: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'not', 'is', 'order', 'limit']) q[method] = () => q;
    q.eq = (column: string, value: unknown) => {
      eq[column] = value;
      (filters[table] ??= []).push([column, value]);
      return q;
    };
    const result = () => {
      if (table === 'judge_assignments')
        return { data: assignments[eq.person_id as string] ?? [], error: null };
      if (table === 'people') return { data: people[eq.id as string] ?? null, error: null };
      if (table === 'email_log') return { data: earlierSend, error: null };
      throw new Error(`unexpected table ${table}`);
    };
    q.maybeSingle = () => Promise.resolve(result());
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    q.insert = (rows: Record<string, unknown>[]) => {
      events.push(`insert:${table}`);
      logRows.push(...rows);
      return Promise.resolve({ error: null });
    };
    return q;
  }

  const supabase = {
    from: (table: string) => query(table),
    storage: {
      from: () => ({
        upload: (path: string, _bytes: Uint8Array, opts: unknown) => {
          events.push('storage:upload');
          uploads.push({ path, options: opts });
          return Promise.resolve({ error: null });
        },
        createSignedUrl: () => {
          events.push('storage:sign');
          return Promise.resolve({
            data: { signedUrl: 'https://storage.example/signed?t=x' },
            error: null,
          });
        },
      }),
    },
  };
  return { supabase: supabase as never, events, uploads, logRows, filters };
}

const sendPayload = (over: Partial<JudgeRecordPayload> = {}): JudgeRecordPayload => ({
  action: 'send',
  showId: SHOW.id,
  judgeId: JUDGE,
  day: DAY,
  pdfBase64: PDF_BASE64,
  ...over,
});

const deps = (sendEmail = vi.fn().mockResolvedValue('msg-1')) => ({
  getEnv: (name: string) => (name === 'RESEND_API_KEY' ? 're_test' : undefined),
  now: () => new Date('2026-12-07T20:00:00.000Z'),
  sendEmail,
});

describe('previewJudgeRecord', () => {
  it('shows the assigned judge and the address on file', async () => {
    const { supabase } = makeStub();
    expect(
      await previewJudgeRecord(supabase, SHOW, {
        action: 'preview',
        showId: SHOW.id,
        judgeId: JUDGE,
        day: DAY,
      })
    ).toEqual({
      action: 'preview',
      judgeName: 'Pat Donovan',
      email: 'pat@example.com',
      reason: null,
    });
  });

  it('offers a download when the judge has no email', async () => {
    const { supabase } = makeStub({
      people: {
        [JUDGE]: { email: null, first_name: 'Pat', last_name: 'Donovan', deleted_at: null },
      },
    });
    expect(
      await previewJudgeRecord(supabase, SHOW, {
        action: 'preview',
        showId: SHOW.id,
        judgeId: JUDGE,
        day: DAY,
      })
    ).toMatchObject({ email: null, reason: 'no_email' });
  });
});

describe('sendJudgeRecord', () => {
  it('emails only the assigned judge, resolved server-side, with a link and no attachment', async () => {
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase, events, uploads, logRows } = makeStub();
    const result = await sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = sendEmail.mock.calls[0]![0] as Record<string, string>;
    expect(call.recipient).toBe('pat@example.com');
    expect(call.idempotencyKey).toMatch(
      new RegExp(`^judge-record-${SHOW.id}-${JUDGE}-${DAY}-[0-9a-f]{16}$`)
    );
    expect(call.html).toContain('https://storage.example/signed?t=x');
    expect(call).not.toHaveProperty('attachments');
    expect(uploads[0]!.path).toMatch(new RegExp(`^${SHOW.id}/judge-records/${JUDGE}-${DAY}-`));
    expect(events.indexOf('storage:upload')).toBeLessThan(events.indexOf('storage:sign'));
    expect(logRows).toEqual([
      expect.objectContaining({
        email_type: 'judge_record',
        show_id: SHOW.id,
        status: 'sent',
        resend_message_id: 'msg-1',
      }),
    ]);
    expect(result).toMatchObject({
      judgeName: 'Pat Donovan',
      email: 'pat@example.com',
      alreadySent: false,
    });
  });

  it('reads the judge only from the assignment: the request has no way to name an address', async () => {
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase } = makeStub();
    const tampered = {
      ...sendPayload(),
      to: 'attacker@example.com',
      recipients: ['attacker@example.com'],
    };
    await sendJudgeRecord(supabase, SHOW, tampered as JudgeRecordPayload, deps(sendEmail));
    expect((sendEmail.mock.calls[0]![0] as { recipient: string }).recipient).toBe(
      'pat@example.com'
    );
  });

  it('sends nothing for a person who is not assigned that day', async () => {
    const sendEmail = vi.fn();
    const { supabase, uploads } = makeStub({
      assignments: { [OTHER_JUDGE]: [assignedRow(DAY)], [JUDGE]: [assignedRow('2026-12-08')] },
      people: {
        [OTHER_JUDGE]: {
          email: 'other@example.com',
          first_name: 'Lee',
          last_name: 'Ng',
          deleted_at: null,
        },
        [JUDGE]: {
          email: 'pat@example.com',
          first_name: 'Pat',
          last_name: 'Donovan',
          deleted_at: null,
        },
      },
    });
    await expect(
      sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail))
    ).rejects.toMatchObject({
      status: 422,
      code: 'judge_not_assigned',
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('yields no send for a judge without an email', async () => {
    const sendEmail = vi.fn();
    const { supabase, uploads } = makeStub({
      people: { [JUDGE]: { email: '', first_name: 'Pat', last_name: 'Donovan', deleted_at: null } },
    });
    const error = await sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail)).catch(
      e => e
    );
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 422, code: 'judge_has_no_email' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('does not send the same record twice, and says when it went', async () => {
    const sendEmail = vi.fn();
    const { supabase, uploads } = makeStub({ earlierSend: { created_at: '2026-12-07T19:00:00Z' } });
    expect(await sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail))).toMatchObject({
      alreadySent: true,
      sentAt: '2026-12-07T19:00:00Z',
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('sends again on purpose, under a key of its own', async () => {
    const sendEmail = vi.fn().mockResolvedValue('msg-2');
    const attemptId = 'd0000000-0000-4000-8000-000000000004';
    const { supabase } = makeStub({ earlierSend: { created_at: '2026-12-07T19:00:00Z' } });
    const result = await sendJudgeRecord(
      supabase,
      SHOW,
      sendPayload({ sendAgain: true, attemptId }),
      deps(sendEmail)
    );
    expect(result.alreadySent).toBe(false);
    expect(
      (sendEmail.mock.calls[0]![0] as { idempotencyKey: string }).idempotencyKey.endsWith(attemptId)
    ).toBe(true);
  });

  it('refuses a file that is not a PDF before storing or sending', async () => {
    const sendEmail = vi.fn();
    const { supabase, uploads } = makeStub();
    await expect(
      sendJudgeRecord(supabase, SHOW, sendPayload({ pdfBase64: btoa('<html>') }), deps(sendEmail))
    ).rejects.toMatchObject({ status: 413 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('records a provider failure and tells the secretary to save the PDF', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('down'));
    const { supabase, logRows } = makeStub();
    await expect(
      sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail))
    ).rejects.toMatchObject({
      status: 502,
    });
    expect(logRows).toEqual([
      expect.objectContaining({ status: 'failed', resend_message_id: null }),
    ]);
  });
});
