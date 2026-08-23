// @vitest-environment node
//
// Deno code, never a browser. jsdom's own ArrayBuffer makes WebCrypto reject
// buffers built in test code, on some Node builds and not others.
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../_shared/http/responses.ts';
import { runPrintReminder, validateReminderRequest } from './reminderRun.ts';

const SHOW_ID = 'a0000000-0000-4000-8000-000000000001';
const CLUB_ID = 'c0000000-0000-4000-8000-000000000001';
const DAY = '2026-10-04';

interface StubOptions {
  hasPacket?: boolean;
  confirmations?: unknown[];
  /**
   * Runs once, immediately after the stale-claim READ — the only window in
   * which a competing run can win. Mutating before the read instead just
   * changes what we read, and the CAS then matches, which is why the first
   * attempt at this test proved nothing.
   */
  raceAfterRead?: (rows: Record<string, { claimed_at: string; sent_at: string | null }>) => void;
  /** How many times stamping `sent_at` fails before succeeding. */
  stampFailures?: number;
  /** kind -> the row already in the ledger. */
  existingReminders?: Record<string, { claimed_at: string; sent_at: string | null }>;
  recipients?: { email: string | null; show_id: string | null; club_id: string | null }[];
}

function makeStub(options: StubOptions = {}) {
  const {
    hasPacket = true,
    confirmations = [],
    existingReminders = {},
    recipients = [{ email: 'secretary@example.com', show_id: SHOW_ID, club_id: null }],
  } = options;
  const reminders: Record<string, { claimed_at: string; sent_at: string | null }> = {
    ...existingReminders,
  };
  const ops: string[] = [];

  function thenable(result: unknown) {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'or', 'in', 'order', 'limit', 'match']) {
      q[m] = () => q;
    }
    q.maybeSingle = () => Promise.resolve(result);
    q.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  }

  function reminderQuery() {
    const q: Record<string, unknown> = {};
    let kind = '';
    let casOn: string | null = null;
    let requiresUnsent = false;
    for (const m of ['select', 'eq', 'is', 'limit']) q[m] = () => q;
    q.match = (criteria: Record<string, unknown>) => {
      kind = String(criteria.reminder_kind ?? '');
      return q;
    };
    q.insert = (row: Record<string, unknown>) => {
      const k = String(row.reminder_kind);
      if (reminders[k]) {
        kind = k;
        ops.push(`reminder-conflict:${k}`);
        return Promise.resolve({ error: { code: '23505' } });
      }
      reminders[k] = { claimed_at: String(row.claimed_at), sent_at: null };
      kind = k;
      ops.push(`reminder-claim:${k}`);
      return Promise.resolve({ error: null });
    };
    q.maybeSingle = () => {
      const snapshot = reminders[kind] ? { ...reminders[kind] } : null;
      if (raceOnce) {
        raceOnce(reminders);
        raceOnce = undefined;
      }
      return Promise.resolve({ data: snapshot, error: null });
    };
    const chainOn = (label: string, patch: Record<string, unknown> = {}) => {
      const chain: Record<string, unknown> = {};
      // Capture the filters production actually passes. The first version of
      // this stub re-implemented the guard itself and ignored them, so the CAS
      // — the whole point of the reclaim — could be deleted with a green
      // suite: exactly the "test certifies the stub" trap in LESSONS.
      for (const m of ['match', 'eq', 'is', 'select']) {
        chain[m] = (...args: unknown[]) => {
          if (m === 'eq' && args[0] === 'claimed_at') casOn = args[1] as string;
          if (m === 'is' && args[0] === 'sent_at' && args[1] === null) requiresUnsent = true;
          (q[m] as (...a: unknown[]) => unknown)(...args);
          return chain;
        };
      }
      chain.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) => {
        if (label === 'release') {
          delete reminders[kind];
          ops.push(`reminder-release:${kind}`);
          return Promise.resolve({ data: [], error: null }).then(res, rej);
        }
        if (label === 'sent' && stampFailures > 0) {
          stampFailures -= 1;
          ops.push(`reminder-stamp-failed:${kind}`);
          return Promise.resolve({ data: null, error: { message: 'blip' } }).then(res, rej);
        }
        const row = reminders[kind];
        if (label === 'reclaim') {
          // Honour the caller's filters rather than second-guessing them.
          const casMatches = casOn === null || (row ? row.claimed_at === casOn : false);
          const unsentOk = !requiresUnsent || (row ? row.sent_at === null : false);
          if (!row || !casMatches || !unsentOk) {
            return Promise.resolve({ data: [], error: null }).then(res, rej);
          }
          row.claimed_at = String(patch.claimed_at);
          ops.push(`reminder-reclaim:${kind}`);
          return Promise.resolve({ data: [{ id: 'r1' }], error: null }).then(res, rej);
        }
        if (row) row.sent_at = String(patch.sent_at ?? 'now');
        ops.push(`reminder-sent:${kind}`);
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      };
      return chain;
    };
    q.update = (patch: Record<string, unknown> = {}) =>
      chainOn(patch.sent_at ? 'sent' : 'reclaim', patch);
    q.delete = () => chainOn('release');
    q.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(res, rej);
    return q;
  }

  let stampFailures = options.stampFailures ?? 0;
  let raceOnce = options.raceAfterRead;
  const supabase = {
    from(table: string) {
      if (table === 'shows') {
        return thenable({
          data: { id: SHOW_ID, name: 'Heartland', club_id: CLUB_ID, end_date: '2026-10-05' },
          error: null,
        });
      }
      if (table === 'trial_packet_snapshots') {
        return thenable({ data: hasPacket ? { snapshot_id: 'snap-1' } : null, error: null });
      }
      if (table === 'paperwork_prints') return thenable({ data: confirmations, error: null });
      if (table === 'user_roles') {
        return thenable({
          data: recipients.map((r, i) => ({
            user_id: `p${i}`,
            auth_user_id: `u${i}`,
            club_id: r.club_id,
            show_id: r.show_id,
            roles: { name: 'secretary' },
            people: { email: r.email },
          })),
          error: null,
        });
      }
      if (table === 'club_members') return thenable({ data: [], error: null });
      if (table === 'trial_packet_print_reminders') return reminderQuery();
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as Parameters<typeof runPrintReminder>[0];

  return { supabase, ops, reminders };
}

function makeDeps(sendEmail = vi.fn().mockResolvedValue('msg-1')) {
  return {
    getEnv: () => 'resend-key',
    now: () => new Date('2026-10-04T01:00:00.000Z'),
    sendEmail,
  };
}

const request = { showId: SHOW_ID, trialDate: DAY, kind: 'evening-before' as const };

describe('validateReminderRequest', () => {
  it('rejects anything that is not a real show, day, and slot', () => {
    expect(() => validateReminderRequest({})).toThrow(HttpError);
    expect(() => validateReminderRequest({ showId: 'nope', trialDate: DAY, kind: 'morning-of' })).toThrow(HttpError);
    expect(() => validateReminderRequest({ showId: SHOW_ID, trialDate: 'today', kind: 'morning-of' })).toThrow(HttpError);
    expect(() => validateReminderRequest({ showId: SHOW_ID, trialDate: DAY, kind: 'whenever' })).toThrow(HttpError);
    expect(validateReminderRequest(request)).toEqual(request);
  });
});

describe('runPrintReminder', () => {
  it('emails the show officials when nobody has confirmed the print', async () => {
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase } = makeStub();

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: true, recipientCount: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].recipient).toBe('secretary@example.com');
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/Tonight: print/);
  });

  it('goes quiet once the CURRENT packet is confirmed printed', async () => {
    const sendEmail = vi.fn();
    const { supabase } = makeStub({
      confirmations: [
        {
          report_id: 'emergency-trial-packet',
          coverage: { trialDate: DAY, snapshotId: 'snap-1' },
          voided_at: null,
        },
      ],
    });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: false, reason: 'already-printed' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('still chases when the printed copy has been superseded', async () => {
    // The secretary printed Thursday's packet and marked it. Friday evening's
    // regeneration added the late entries, so the box now holds a stale
    // catalog. Matching on the day alone went quiet here — the server called
    // it done while the UI model called the same state `stale`.
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase } = makeStub({
      confirmations: [
        {
          report_id: 'emergency-trial-packet',
          coverage: { trialDate: DAY, snapshotId: 'snap-thursday' },
          voided_at: null,
        },
      ],
    });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: true, recipientCount: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('keys the provider idempotency on the SHOW as well as the day and slot', async () => {
    // Two clubs trialling the same date shared a key, so Resend replayed the
    // first response for the second and its officials got nothing — while
    // this function recorded `sent`. Same-weekend multi-club trials are the
    // normal case, not an edge case.
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase } = makeStub();

    await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe(
      `print-reminder-${SHOW_ID}-${DAY}-evening-before-secretary@example.com`
    );
  });

  it('gives each official its own idempotency key', async () => {
    // Resend replays the original response for a repeated key. Sharing one key
    // across the loop would mail the first official and hand back their id for
    // everyone else -- recording a full send that never happened. The show and
    // day alone are NOT enough once the send is per recipient.
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce('msg-1')
      .mockResolvedValueOnce('msg-2');
    const { supabase } = makeStub({
      recipients: [
        { email: 'secretary@example.com', show_id: SHOW_ID, club_id: null },
        { email: 'chair@example.com', show_id: SHOW_ID, club_id: null },
      ],
    });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: true, recipientCount: 2 });
    const keys = sendEmail.mock.calls.map(call => call[0].idempotencyKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys.every(key => key.startsWith(`print-reminder-${SHOW_ID}-${DAY}-evening-before-`))).toBe(
      true
    );
  });

  it('does not chase a print for a packet that does not exist', async () => {
    const sendEmail = vi.fn();
    const { supabase } = makeStub({ hasPacket: false });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: false, reason: 'no-packet' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends each slot once, and the two slots independently', async () => {
    // The morning send is the last moment this can be acted on, so the evening
    // send must not suppress it — and a re-run of either must not email twice.
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase } = makeStub({
      existingReminders: {
        'evening-before': { claimed_at: '2026-10-04T00:59:00.000Z', sent_at: '2026-10-04T00:59:30.000Z' },
      },
    });

    expect(await runPrintReminder(supabase, request, makeDeps(sendEmail))).toEqual({
      sent: false,
      reason: 'already-reminded',
    });
    expect(sendEmail).not.toHaveBeenCalled();

    expect(
      await runPrintReminder(supabase, { ...request, kind: 'morning-of' }, makeDeps(sendEmail))
    ).toEqual({ sent: true, recipientCount: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when the send fails, so the slot is not silently burned', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('provider down'));
    const { supabase, ops, reminders } = makeStub();

    await expect(runPrintReminder(supabase, request, makeDeps(sendEmail))).rejects.toBeInstanceOf(
      HttpError
    );

    expect(ops).toContain('reminder-release:evening-before');
    expect(reminders['evening-before']).toBeUndefined();
  });

  it('releases the claim when there is nobody to email', async () => {
    // A show with no reachable official tonight may have one by morning.
    const sendEmail = vi.fn();
    const { supabase, reminders } = makeStub({ recipients: [{ email: null, show_id: SHOW_ID, club_id: null }] });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: false, reason: 'no-recipients' });
    expect(reminders['evening-before']).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('claims before sending, and stamps sent only after the provider accepts', async () => {
    const sendEmail = vi.fn().mockImplementation(() => {
      // Ordering is observed rather than grepped: a stamp written before the
      // send would report a delivered reminder that never left.
      expect(ops).toContain('reminder-claim:evening-before');
      expect(ops).not.toContain('reminder-sent:evening-before');
      return Promise.resolve('msg-1');
    });
    const { supabase, ops } = makeStub();

    await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(ops).toEqual(['reminder-claim:evening-before', 'reminder-sent:evening-before']);
  });
});

describe('the reminder lease', () => {
  it('takes over a claim whose run died before it sent', async () => {
    // The migration always described a lease; the first version never
    // implemented one and returned `already-reminded` on any conflict. An
    // isolate dying between the INSERT and the send — recipient resolution is
    // two or three round trips — suppressed the slot permanently, which is a
    // trial day with no paper and no chase.
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase, ops } = makeStub({
      existingReminders: {
        'evening-before': { claimed_at: '2026-10-03T23:00:00.000Z', sent_at: null },
      },
    });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: true, recipientCount: 1 });
    expect(ops).toContain('reminder-reclaim:evening-before');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('leaves a fresh claim alone while another run is still working', async () => {
    const sendEmail = vi.fn();
    const { supabase } = makeStub({
      existingReminders: {
        'evening-before': { claimed_at: '2026-10-04T00:59:30.000Z', sent_at: null },
      },
    });

    expect(await runPrintReminder(supabase, request, makeDeps(sendEmail))).toEqual({
      sent: false,
      reason: 'already-reminded',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('never re-sends a slot that already went out', async () => {
    const sendEmail = vi.fn();
    const { supabase } = makeStub({
      existingReminders: {
        'evening-before': { claimed_at: '1970-01-01T00:00:00.000Z', sent_at: '1970-01-01T00:01:00.000Z' },
      },
    });

    expect(await runPrintReminder(supabase, request, makeDeps(sendEmail))).toEqual({
      sent: false,
      reason: 'already-reminded',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('stamping the send', () => {
  it('retries once rather than leaving a sent reminder unrecorded', async () => {
    // A null `sent_at` lets the lease expire and a later run in the same
    // window send a SECOND identical reminder. A transient blip is the likely
    // cause, and one retry is far cheaper than the duplicate.
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase, ops, reminders } = makeStub({ stampFailures: 1 });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: true, recipientCount: 1 });
    expect(ops).toContain('reminder-stamp-failed:evening-before');
    expect(ops).toContain('reminder-sent:evening-before');
    expect(reminders['evening-before']?.sent_at).toBeTruthy();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('never reports a delivered reminder as an error', async () => {
    // Throwing here would invite a manual retry that emails everyone again.
    const sendEmail = vi.fn().mockResolvedValue('msg-1');
    const { supabase } = makeStub({ stampFailures: 5 });

    await expect(runPrintReminder(supabase, request, makeDeps(sendEmail))).resolves.toEqual({
      sent: true,
      recipientCount: 1,
    });
  });
});

describe('the reclaim is a compare-and-swap, not a blind overwrite', () => {
  const stale = {
    'evening-before': { claimed_at: '2026-10-03T23:00:00.000Z', sent_at: null },
  };

  it('loses to a competing run that reclaimed between our read and our update', async () => {
    // Both runs see the same stale claim; only the one whose UPDATE still
    // matches the token it READ may proceed. Without `.eq('claimed_at', …)`
    // both overwrite and both send.
    const sendEmail = vi.fn();
    const { supabase } = makeStub({
      existingReminders: stale,
      raceAfterRead: rows => {
        rows['evening-before'] = {
          claimed_at: '2026-10-04T00:59:59.000Z',
          sent_at: null,
        };
      },
    });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: false, reason: 'already-reminded' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('loses to a competing run that SENT between our read and our update', async () => {
    // Without `.is('sent_at', null)` we would reclaim a slot that has already
    // gone out and email every official a second time.
    const sendEmail = vi.fn();
    const { supabase } = makeStub({
      existingReminders: stale,
      raceAfterRead: rows => {
        rows['evening-before'] = {
          claimed_at: '2026-10-03T23:00:00.000Z',
          sent_at: '2026-10-04T00:59:59.000Z',
        };
      },
    });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: false, reason: 'already-reminded' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

