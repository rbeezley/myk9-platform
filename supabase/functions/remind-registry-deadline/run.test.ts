// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runRegistryDeadlineReminders, type RunDeps } from './run.ts';
import type { ClaimKey, ReminderCandidate, ReminderStore } from './store.ts';

const SHOW_ID = 'a0000000-0000-4000-8000-000000002077';
const NOW = new Date('2026-11-22T20:00:00Z');

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    showId: SHOW_ID,
    showName: 'Fall Scent Trial',
    trials: [
      {
        date: '2026-11-17',
        timeZone: 'America/Los_Angeles',
        registryId: 'AKC',
        trialType: 'Scent Work',
        status: 'completed',
      },
    ],
    submissions: [],
    ...overrides,
  };
}

/** The claim table in memory: one row per (show, registry, deadline), like the unique index. */
function makeStore(candidates: ReminderCandidate[]) {
  const rows = new Map<string, { token: string; sent: boolean; accepted: string[] }>();
  const id = (key: ClaimKey) => `${key.showId}|${key.registryId}|${key.deadline}`;
  const store: ReminderStore = {
    loadCandidates: async () => candidates,
    claim: async (key, now) => {
      const row = rows.get(id(key));
      // A row that was not finished is taken over by the next run, like an expired lease.
      if (row?.sent) return null;
      if (row && row.token === now.toISOString()) return null;
      const token = now.toISOString();
      rows.set(id(key), { token, sent: false, accepted: row?.accepted ?? [] });
      return { token, accepted: row?.accepted ?? [] };
    },
    release: async (key, token) => {
      const row = rows.get(id(key));
      if (row && row.token === token && !row.sent) rows.delete(id(key));
    },
    recordAccepted: async (key, _token, accepted) => {
      const row = rows.get(id(key));
      if (row) row.accepted = [...accepted];
      return true;
    },
    stampSent: async key => {
      const row = rows.get(id(key));
      if (row) row.sent = true;
      return true;
    },
  };
  return { store, rows };
}

function makeDeps(
  candidates: ReminderCandidate[],
  overrides: Partial<RunDeps> = {}
): RunDeps & {
  sendEmail: ReturnType<typeof vi.fn>;
  logAttempts: ReturnType<typeof vi.fn>;
  rows: Map<string, { token: string; sent: boolean; accepted: string[] }>;
} {
  const { store, rows } = makeStore(candidates);
  const sendEmail = vi.fn().mockResolvedValue('msg-1');
  const logAttempts = vi.fn().mockResolvedValue(undefined);
  return {
    store,
    recipientsFor: async () => ['secretary@example.com'],
    apiKey: 'key',
    appOrigin: 'https://myk9show.com',
    now: NOW,
    ...overrides,
    sendEmail,
    logAttempts,
    rows,
  };
}

describe('runRegistryDeadlineReminders', () => {
  it('sends one reminder for an open line, naming it and linking the Finish list', async () => {
    const deps = makeDeps([candidate()]);
    const summary = await runRegistryDeadlineReminders(deps);

    expect(summary).toEqual({ sent: 1, alreadyReminded: 0, noRecipients: 0, failed: 0 });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(deps.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'secretary@example.com',
        subject: 'Fall Scent Trial: AKC results are due in 2 days',
        idempotencyKey: `registry-deadline-${SHOW_ID}-AKC-2026-11-24-secretary@example.com`,
        html: expect.stringContaining(`https://myk9show.com/shows/${SHOW_ID}/results`),
      })
    );
    const html = (deps.sendEmail.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain('The results file has not been sent to AKC.');
  });

  it('sends nothing when every such line is ticked', async () => {
    const deps = makeDeps([candidate({ submissions: [{ organization: 'AKC', status: 'sent' }] })]);
    const summary = await runRegistryDeadlineReminders(deps);
    expect(summary.sent).toBe(0);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.rows.size).toBe(0);
  });

  it('sends nothing on a re-run, and none on a run the next hour', async () => {
    const deps = makeDeps([candidate()]);
    await runRegistryDeadlineReminders(deps);
    const again = await runRegistryDeadlineReminders(deps);
    const nextHour = await runRegistryDeadlineReminders({
      ...deps,
      now: new Date(NOW.getTime() + 3_600_000),
    });
    const nextDay = await runRegistryDeadlineReminders({
      ...deps,
      now: new Date(NOW.getTime() + 86_400_000),
    });

    expect(again).toMatchObject({ sent: 0, alreadyReminded: 1 });
    expect(nextHour).toMatchObject({ sent: 0, alreadyReminded: 1 });
    expect(nextDay).toMatchObject({ sent: 0, alreadyReminded: 1 });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('does not fire before the time-zone midnight that makes it two days out', async () => {
    // 07:30Z is 23:30 the evening before in Los Angeles: still three days out.
    const early = makeDeps([candidate()], { now: new Date('2026-11-22T07:30:00Z') });
    await runRegistryDeadlineReminders(early);
    expect(early.sendEmail).not.toHaveBeenCalled();

    const after = makeDeps([candidate()], { now: new Date('2026-11-22T08:30:00Z') });
    await runRegistryDeadlineReminders(after);
    expect(after.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when nobody can be reached, so a later run still sends', async () => {
    const deps = makeDeps([candidate()], { recipientsFor: async () => [] });
    const first = await runRegistryDeadlineReminders(deps);
    expect(first).toMatchObject({ sent: 0, noRecipients: 1 });
    expect(deps.rows.size).toBe(0);

    const later = await runRegistryDeadlineReminders({
      ...deps,
      recipientsFor: async () => ['secretary@example.com'],
    });
    expect(later.sent).toBe(1);
  });

  it('releases the claim when every send fails, and does not count it as sent', async () => {
    const deps = makeDeps([candidate()]);
    deps.sendEmail.mockRejectedValue(new Error('provider down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await runRegistryDeadlineReminders(deps);
    errors.mockRestore();

    expect(summary).toMatchObject({ sent: 0, failed: 1 });
    expect(deps.rows.size).toBe(0);
  });

  it('keeps the claim open when one of several recipients is not reached, and retries only that one', async () => {
    const deps = makeDeps([candidate()], {
      recipientsFor: async () => ['a@example.com', 'b@example.com'],
    });
    deps.sendEmail.mockRejectedValueOnce(new Error('bounce')).mockResolvedValue('msg-2');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = await runRegistryDeadlineReminders(deps);
    errors.mockRestore();

    // a@ failed, b@ was accepted: not "sent", and the claim stays with b@ recorded.
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    const row = [...deps.rows.values()][0];
    expect(row).toMatchObject({ sent: false, accepted: ['b@example.com'] });

    const later = new Date(NOW.getTime() + 3_600_000);
    const retry = await runRegistryDeadlineReminders({ ...deps, now: later });
    expect(retry.sent).toBe(1);
    const sentTo = deps.sendEmail.mock.calls.map(
      call => (call[0] as { recipient: string }).recipient
    );
    expect(sentTo).toEqual(['a@example.com', 'b@example.com', 'a@example.com']);
    expect([...deps.rows.values()][0]?.sent).toBe(true);

    const again = await runRegistryDeadlineReminders({
      ...deps,
      now: new Date(later.getTime() + 3_600_000),
    });
    expect(again).toMatchObject({ sent: 0, alreadyReminded: 1 });
  });

  it('does not count a send with no provider message id as accepted', async () => {
    const deps = makeDeps([candidate()]);
    deps.sendEmail.mockResolvedValue(null);
    const summary = await runRegistryDeadlineReminders(deps);
    expect(summary).toMatchObject({ sent: 0, failed: 1 });
    expect(deps.rows.size).toBe(0);
    expect(deps.logAttempts).toHaveBeenCalledWith(SHOW_ID, [
      { recipient: 'secretary@example.com', messageId: null, error: 'provider_no_message_id' },
    ]);
  });

  it('records each attempt with the provider id so a bounce can be matched', async () => {
    const deps = makeDeps([candidate()], {
      recipientsFor: async () => ['a@example.com', 'b@example.com'],
    });
    deps.sendEmail.mockResolvedValueOnce('msg-a').mockResolvedValueOnce('msg-b');
    await runRegistryDeadlineReminders(deps);
    // One row per address, written as each settles, so an early event always finds its row.
    expect(deps.logAttempts).toHaveBeenNthCalledWith(1, SHOW_ID, [
      { recipient: 'a@example.com', messageId: 'msg-a', error: null },
    ]);
    expect(deps.logAttempts).toHaveBeenNthCalledWith(2, SHOW_ID, [
      { recipient: 'b@example.com', messageId: 'msg-b', error: null },
    ]);
    expect(deps.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [{ name: 'myk9_email_type', value: 'registry_deadline_reminder' }],
      })
    );
  });

  it('logs the first address before it sends the second', async () => {
    const deps = makeDeps([candidate()], {
      recipientsFor: async () => ['a@example.com', 'b@example.com'],
    });
    const order: string[] = [];
    deps.sendEmail.mockImplementation(async (input: { recipient: string }) => {
      order.push(`send ${input.recipient}`);
      return `msg-${input.recipient}`;
    });
    deps.logAttempts.mockImplementation(
      async (_show: string, attempts: { recipient: string }[]) => {
        order.push(`log ${attempts[0]?.recipient}`);
      }
    );
    await runRegistryDeadlineReminders(deps);
    expect(order).toEqual([
      'send a@example.com',
      'log a@example.com',
      'send b@example.com',
      'log b@example.com',
    ]);
  });

  it('counts a failed recipient lookup as a failure, releases the claim and tells nobody', async () => {
    const deps = makeDeps([candidate()], {
      recipientsFor: async () => {
        throw new Error('lookup failed');
      },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await runRegistryDeadlineReminders(deps);
    expect(errors).toHaveBeenCalledWith(
      'remind-registry-deadline: recipient lookup failed',
      expect.objectContaining({ showId: SHOW_ID })
    );
    errors.mockRestore();

    expect(summary).toEqual({ sent: 0, alreadyReminded: 0, noRecipients: 0, failed: 1 });
    expect(deps.rows.size).toBe(0);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('keeps going when one show fails', async () => {
    const other = candidate({ showId: 'b0000000-0000-4000-8000-000000002077' });
    const deps = makeDeps([candidate(), other], {
      recipientsFor: async showId => {
        if (showId === SHOW_ID) throw new Error('lookup failed');
        return ['secretary@example.com'];
      },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await runRegistryDeadlineReminders(deps);
    errors.mockRestore();
    expect(summary).toMatchObject({ sent: 1, failed: 1 });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('reminds again for a corrected file the list reopens, naming it', async () => {
    const deps = makeDeps([
      candidate({
        submissions: [{ organization: 'AKC', status: 'sent', submittedAt: '2026-11-18T12:00:00Z' }],
        scoreChanges: [{ trialId: 'trial-1', changedAt: '2026-11-19T12:00:00Z' }],
        trials: [
          {
            id: 'trial-1',
            date: '2026-11-17',
            timeZone: 'America/Los_Angeles',
            registryId: 'AKC',
            trialType: 'Scent Work',
            status: 'completed',
          },
        ],
      }),
    ]);
    await runRegistryDeadlineReminders(deps);
    const html = (deps.sendEmail.mock.calls[0]?.[0] as { html: string }).html;
    expect(html).toContain('The corrected file has not been sent.');
  });
});
