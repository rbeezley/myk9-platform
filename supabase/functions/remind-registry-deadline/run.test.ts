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
  const rows = new Map<string, { token: string; sent: boolean }>();
  const id = (key: ClaimKey) => `${key.showId}|${key.registryId}|${key.deadline}`;
  const store: ReminderStore = {
    loadCandidates: async () => candidates,
    claim: async (key, now) => {
      if (rows.has(id(key))) return null;
      const token = now.toISOString();
      rows.set(id(key), { token, sent: false });
      return token;
    },
    release: async (key, token) => {
      const row = rows.get(id(key));
      if (row && row.token === token && !row.sent) rows.delete(id(key));
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
): RunDeps & { sendEmail: ReturnType<typeof vi.fn>; rows: Map<string, unknown> } {
  const { store, rows } = makeStore(candidates);
  const sendEmail = vi.fn().mockResolvedValue('msg-1');
  return {
    store,
    recipientsFor: async () => ['secretary@example.com'],
    apiKey: 'key',
    appOrigin: 'https://myk9show.com',
    now: NOW,
    ...overrides,
    sendEmail,
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

  it('keeps the claim when one of several recipients is reached', async () => {
    const deps = makeDeps([candidate()], {
      recipientsFor: async () => ['a@example.com', 'b@example.com'],
    });
    deps.sendEmail.mockRejectedValueOnce(new Error('bounce')).mockResolvedValue('msg-2');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await runRegistryDeadlineReminders(deps);
    errors.mockRestore();

    expect(summary.sent).toBe(1);
    expect(deps.rows.size).toBe(1);
    const again = await runRegistryDeadlineReminders(deps);
    expect(again.sent).toBe(0);
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
    // A failed recipient lookup counts as nobody reachable; the other show still gets its email.
    expect(summary.sent).toBe(1);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });
});
