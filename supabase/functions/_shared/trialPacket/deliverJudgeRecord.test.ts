// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../http/responses.ts';
import { resolveSignedLinkLifetimeSeconds } from './delivery.ts';
import { previewJudgeRecord, sendJudgeRecord } from './deliverJudgeRecord.ts';
import type { PacketShow } from './deliverStoredPacket.ts';
import { judgeRecordIdempotencyKey, uuidFromKey, type JudgeRecordPayload } from './judgeRecord.ts';

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
  /** email_log rows already on file, as the table holds them; filters run against these. */
  emailLog?: LogRow[];
}

interface LogRow {
  show_id: string;
  related_id: string;
  email_type: string;
  status: string;
  created_at: string;
  [column: string]: unknown;
}

/** The related_id the function derives for a show, judge and day (a uuid hashed from the key). */
async function relatedIdFor(judge = JUDGE, day = DAY): Promise<string> {
  return uuidFromKey(judgeRecordIdempotencyKey({ showId: SHOW.id, judgeId: judge, day }));
}

async function logRow(
  status: string,
  createdAt: string,
  over: Partial<LogRow> = {}
): Promise<LogRow> {
  return {
    show_id: SHOW.id,
    related_id: await relatedIdFor(),
    email_type: 'judge_record',
    status,
    created_at: createdAt,
    ...over,
  };
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
    emailLog = [],
  } = options;
  const events: string[] = [];
  const uploads: { path: string; options: unknown }[] = [];
  // The real table: the "already sent" check filters these rows, so a wrong filter shows up.
  const logRows: Record<string, unknown>[] = emailLog;
  const contents: Record<string, unknown>[] = [];

  function query(table: string) {
    const eq: Record<string, unknown> = {};
    const notIn: Record<string, string[]> = {};
    let newestFirst = false;
    let max = Infinity;
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'is']) q[method] = () => q;
    q.eq = (column: string, value: unknown) => {
      eq[column] = value;
      return q;
    };
    q.not = (column: string, operator: string, value: string) => {
      if (operator === 'in') notIn[column] = value.slice(1, -1).split(',');
      return q;
    };
    q.order = (_column: string, opts: { ascending: boolean }) => {
      newestFirst = !opts.ascending;
      return q;
    };
    q.limit = (count: number) => {
      max = count;
      return q;
    };
    const logMatches = () => {
      const found = (logRows as LogRow[])
        .filter(row => Object.entries(eq).every(([column, value]) => row[column] === value))
        .filter(row =>
          Object.entries(notIn).every(([column, values]) => !values.includes(row[column] as string))
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      return (newestFirst ? found.reverse() : found).slice(0, max);
    };
    const result = (single: boolean) => {
      if (table === 'judge_assignments')
        return { data: assignments[eq.person_id as string] ?? [], error: null };
      if (table === 'people') return { data: people[eq.id as string] ?? null, error: null };
      if (table === 'email_log') {
        const found = logMatches();
        return { data: single ? (found[0] ?? null) : found, error: null };
      }
      throw new Error(`unexpected table ${table}`);
    };
    q.maybeSingle = () => Promise.resolve(result(true));
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result(false)).then(resolve);
    q.insert = (rows: Record<string, unknown>[]) => {
      events.push(`insert:${table}`);
      const stamped = rows.map((row, index) => ({
        id: `log-${logRows.length + index + 1}`,
        created_at: '2026-12-07T20:00:00Z',
        ...row,
      }));
      if (table === 'email_log') logRows.push(...stamped);
      else contents.push(...(rows as Record<string, unknown>[]));
      const done = { error: null, data: stamped.map(row => ({ id: row.id })) };
      return {
        select: () => Promise.resolve(done),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(done).then(resolve),
      };
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
  return { supabase: supabase as never, events, uploads, logRows, contents };
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
      lastSentAt: null,
    });
  });

  it('says when the judge was last emailed, counting a delivered email and not a bounced one', async () => {
    const { supabase } = makeStub({
      emailLog: [
        await logRow('delivered', '2026-12-07T18:00:00Z'),
        await logRow('bounced', '2026-12-07T19:30:00Z'),
      ],
    });
    expect(
      await previewJudgeRecord(supabase, SHOW, {
        action: 'preview',
        showId: SHOW.id,
        judgeId: JUDGE,
        day: DAY,
      })
    ).toMatchObject({ lastSentAt: '2026-12-07T18:00:00Z' });
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
    expect(call.idempotencyKey).toBe(`judge-record-${SHOW.id}-${JUDGE}-${DAY}`);
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

  it('sends once per show, judge and day: a second press says when it went and sends nothing', async () => {
    const sendEmail = vi.fn();
    const { supabase, uploads } = makeStub({
      emailLog: [await logRow('sent', '2026-12-07T19:00:00Z')],
    });
    const result = await sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail));
    expect(result).toMatchObject({ alreadySent: true, sentAt: '2026-12-07T19:00:00Z' });
    // The earlier link's expiry, counted from the earlier send (an hour before "now"), not a new one.
    expect(Date.parse(result.linkExpiresAt)).toBe(
      Date.parse('2026-12-07T19:00:00Z') +
        resolveSignedLinkLifetimeSeconds(SHOW.end_date, new Date('2026-12-07T19:00:00Z')) * 1000
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('sends once for two builds of the same record with different bytes', async () => {
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase, logRows, uploads } = makeStub();
    const first = await sendJudgeRecord(
      supabase,
      SHOW,
      sendPayload({ pdfBase64: btoa('%PDF-1.4 build one') }),
      deps(sendEmail)
    );
    // The row the first send wrote is what the second build finds.
    const second = await sendJudgeRecord(
      supabase,
      SHOW,
      sendPayload({ pdfBase64: btoa('%PDF-1.4 build two, other dates') }),
      deps(sendEmail)
    );
    expect(first.alreadySent).toBe(false);
    expect(second.alreadySent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(uploads).toHaveLength(1);
    expect(logRows).toHaveLength(1);
  });

  it('keeps one day, one judge and one show apart', async () => {
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase } = makeStub({
      emailLog: [
        await logRow('sent', '2026-12-06T19:00:00Z', {
          related_id: await relatedIdFor(JUDGE, '2026-12-06'),
        }),
        await logRow('sent', '2026-12-07T19:00:00Z', {
          related_id: await relatedIdFor(OTHER_JUDGE, DAY),
        }),
        await logRow('sent', '2026-12-07T19:00:00Z', {
          show_id: 'a0000000-0000-4000-8000-0000000000ff',
        }),
        await logRow('sent', '2026-12-07T19:00:00Z', { email_type: 'trial_packet' }),
      ],
    });
    const result = await sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail));
    expect(result.alreadySent).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it.each(['sent', 'delivered', 'opened', 'clicked'])('counts a %s email as sent', async status => {
    const sendEmail = vi.fn();
    const { supabase } = makeStub({
      emailLog: [await logRow(status, '2026-12-07T19:00:00Z')],
    });
    const result = await sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail));
    expect(result.alreadySent).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each(['failed', 'bounced', 'complained', 'suppressed'])(
    'does not count a %s email as sent, so the judge can be emailed again',
    async status => {
      const sendEmail = vi.fn().mockResolvedValue('msg-2');
      const { supabase } = makeStub({
        emailLog: [await logRow(status, '2026-12-07T19:00:00Z')],
      });
      const result = await sendJudgeRecord(supabase, SHOW, sendPayload(), deps(sendEmail));
      expect(result.alreadySent).toBe(false);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    }
  );

  it('reports the latest successful send, ignoring a newer failure', async () => {
    const { supabase } = makeStub({
      emailLog: [
        await logRow('delivered', '2026-12-07T18:00:00Z'),
        await logRow('sent', '2026-12-07T19:00:00Z'),
        await logRow('bounced', '2026-12-07T19:30:00Z'),
      ],
    });
    const result = await sendJudgeRecord(supabase, SHOW, sendPayload(), deps(vi.fn()));
    expect(result).toMatchObject({ alreadySent: true, sentAt: '2026-12-07T19:00:00Z' });
  });

  it('sends again on purpose, as often as asked, each under a key of its own', async () => {
    const sendEmail = vi.fn().mockResolvedValue('msg-2');
    const { supabase, logRows } = makeStub({
      emailLog: [
        await logRow('delivered', '2026-12-07T17:00:00Z'),
        await logRow('sent', '2026-12-07T18:00:00Z'),
        await logRow('sent', '2026-12-07T19:00:00Z'),
      ],
    });
    const first = 'd0000000-0000-4000-8000-000000000004';
    const second = 'd0000000-0000-4000-8000-000000000005';
    for (const attemptId of [first, second]) {
      const result = await sendJudgeRecord(
        supabase,
        SHOW,
        sendPayload({ sendAgain: true, attemptId }),
        deps(sendEmail)
      );
      expect(result.alreadySent).toBe(false);
    }
    const keys = sendEmail.mock.calls.map(
      call => (call[0] as { idempotencyKey: string }).idempotencyKey
    );
    expect(keys[0]!.endsWith(first)).toBe(true);
    expect(keys[1]!.endsWith(second)).toBe(true);
    expect(logRows).toHaveLength(5);
  });

  it('keeps a copy of the email text beside the delivery row', async () => {
    const { supabase, contents } = makeStub();
    await sendJudgeRecord(supabase, SHOW, sendPayload(), deps());
    expect(contents).toEqual([
      expect.objectContaining({
        email_log_id: 'log-1',
        subject: `${SHOW.name}: your judge's record for ${DAY}`,
        html: expect.stringContaining('https://storage.example/signed?t=x'),
      }),
    ]);
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
