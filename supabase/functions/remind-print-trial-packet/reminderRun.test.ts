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
  existingReminders?: string[];
  recipients?: { email: string | null; show_id: string | null; club_id: string | null }[];
}

function makeStub(options: StubOptions = {}) {
  const {
    hasPacket = true,
    confirmations = [],
    existingReminders = [],
    recipients = [{ email: 'secretary@example.com', show_id: SHOW_ID, club_id: null }],
  } = options;
  const reminders = new Set(existingReminders);
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
    for (const m of ['select', 'eq', 'is', 'limit']) q[m] = () => q;
    q.match = (criteria: Record<string, unknown>) => {
      kind = String(criteria.reminder_kind ?? '');
      return q;
    };
    q.insert = (row: Record<string, unknown>) => {
      const k = String(row.reminder_kind);
      if (reminders.has(k)) {
        ops.push(`reminder-conflict:${k}`);
        return Promise.resolve({ error: { code: '23505' } });
      }
      reminders.add(k);
      ops.push(`reminder-claim:${k}`);
      return Promise.resolve({ error: null });
    };
    const chainOn = (label: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['match', 'eq', 'is', 'select']) {
        chain[m] = (...args: unknown[]) => {
          (q[m] as (...a: unknown[]) => unknown)(...args);
          return chain;
        };
      }
      chain.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) => {
        if (label === 'release') {
          reminders.delete(kind);
          ops.push(`reminder-release:${kind}`);
        } else {
          ops.push(`reminder-sent:${kind}`);
        }
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      };
      return chain;
    };
    q.update = () => chainOn('sent');
    q.delete = () => chainOn('release');
    q.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(res, rej);
    return q;
  }

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
    expect(sendEmail.mock.calls[0][0].recipients).toEqual(['secretary@example.com']);
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/Tonight: print/);
  });

  it('goes quiet once the day is confirmed printed', async () => {
    const sendEmail = vi.fn();
    const { supabase } = makeStub({
      confirmations: [
        { report_id: 'emergency-trial-packet', coverage: { trialDate: DAY }, voided_at: null },
      ],
    });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: false, reason: 'already-printed' });
    expect(sendEmail).not.toHaveBeenCalled();
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
    const { supabase } = makeStub({ existingReminders: ['evening-before'] });

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
    expect(reminders.has('evening-before')).toBe(false);
  });

  it('releases the claim when there is nobody to email', async () => {
    // A show with no reachable official tonight may have one by morning.
    const sendEmail = vi.fn();
    const { supabase, reminders } = makeStub({ recipients: [{ email: null, show_id: SHOW_ID, club_id: null }] });

    const outcome = await runPrintReminder(supabase, request, makeDeps(sendEmail));

    expect(outcome).toEqual({ sent: false, reason: 'no-recipients' });
    expect(reminders.has('evening-before')).toBe(false);
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
