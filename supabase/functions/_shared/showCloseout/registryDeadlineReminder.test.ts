// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  REMIND_DAYS_BEFORE,
  buildRegistryDeadlineHtml,
  buildRegistryDeadlineSubject,
  dueRegistryReminders,
  finishListUrl,
  type ReminderTrial,
} from './registryDeadlineReminder.ts';
import { resultsDeadlineFor } from './resultsDeadline.ts';

function trial(overrides: Partial<ReminderTrial> = {}): ReminderTrial {
  return {
    date: '2026-11-17',
    timeZone: 'America/Los_Angeles',
    registryId: 'AKC',
    trialType: 'Scent Work',
    status: 'completed',
    ...overrides,
  };
}

const NOON = (day: string) => new Date(`${day}T20:00:00Z`);

describe('dueRegistryReminders', () => {
  it('names the open AKC line two days before the date the Finish list shows', () => {
    const due = dueRegistryReminders({
      trials: [trial()],
      submissions: [],
      now: NOON('2026-11-22'),
    });
    expect(REMIND_DAYS_BEFORE).toBe(2);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ registryId: 'AKC', deadline: '2026-11-24', daysUntil: 2 });
    // One calculation: the same function the list uses.
    expect(due[0]?.deadline).toBe(resultsDeadlineFor('AKC', '2026-11-17'));
    expect(due[0]?.openLine).toBe('The results file has not been sent to AKC.');
  });

  it('is not due earlier than two days out, and not after the deadline', () => {
    const at = (day: string) =>
      dueRegistryReminders({ trials: [trial()], submissions: [], now: NOON(day) }).length;
    expect(at('2026-11-21')).toBe(0);
    expect(at('2026-11-22')).toBe(1);
    expect(at('2026-11-24')).toBe(1);
    expect(at('2026-11-25')).toBe(0);
  });

  it('sends nothing once the line is ticked', () => {
    for (const status of ['sent', 'submitted', 'Sent']) {
      expect(
        dueRegistryReminders({
          trials: [trial()],
          submissions: [{ organization: 'AKC', status }],
          now: NOON('2026-11-22'),
        })
      ).toEqual([]);
    }
  });

  it('treats a pending or failed submission as still open', () => {
    for (const status of ['pending', 'failed']) {
      expect(
        dueRegistryReminders({
          trials: [trial()],
          submissions: [{ organization: 'AKC', status }],
          now: NOON('2026-11-22'),
        })
      ).toHaveLength(1);
    }
  });

  it('reads a submission that names no registry as covering every registry', () => {
    expect(
      dueRegistryReminders({
        trials: [trial()],
        submissions: [{ organization: null, status: 'sent' }],
        now: NOON('2026-11-22'),
      })
    ).toEqual([]);
  });

  it("does not let another registry's submission close this registry's line", () => {
    const due = dueRegistryReminders({
      trials: [trial()],
      submissions: [{ organization: 'ASCA', status: 'submitted' }],
      now: NOON('2026-11-22'),
    });
    expect(due.map(item => item.registryId)).toEqual(['AKC']);
  });

  it('counts ASCA from 15 days and words its line as a mark', () => {
    const due = dueRegistryReminders({
      trials: [trial({ registryId: 'ASCA', date: '2026-11-10' })],
      submissions: [],
      now: NOON('2026-11-23'),
    });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ registryId: 'ASCA', deadline: '2026-11-25' });
    expect(due[0]?.openLine).toBe('The results are not marked as submitted to ASCA.');
  });

  it('has no reminder for UKC, which has no verified deadline', () => {
    expect(
      dueRegistryReminders({
        trials: [trial({ registryId: 'UKC' })],
        submissions: [],
        now: NOON('2026-11-22'),
      })
    ).toEqual([]);
  });

  it('counts from the LAST trial day, ignoring cancelled and non-scent trials', () => {
    const trials = [
      trial({ date: '2026-11-15' }),
      trial({ date: '2026-11-17' }),
      trial({ date: '2026-11-20', status: 'cancelled' }),
      trial({ date: '2026-11-21', trialType: 'Agility' }),
    ];
    const due = dueRegistryReminders({ trials, submissions: [], now: NOON('2026-11-22') });
    expect(due[0]?.deadline).toBe('2026-11-24');
  });

  it('reads a blank registry as AKC and a blank zone as New York', () => {
    const due = dueRegistryReminders({
      trials: [trial({ registryId: ' ', timeZone: 'Not/AZone' })],
      submissions: [],
      now: NOON('2026-11-22'),
    });
    expect(due[0]?.registryId).toBe('AKC');
  });

  it('reads a padded zone the way the app does: refused, so New York', () => {
    // " America/Los_Angeles" is invalid, so its day is counted in New York. At 07:30Z it is 02:30
    // on Nov 22 in New York (two days out) but 23:30 on Nov 21 in Los Angeles (three days out).
    const at = (timeZone: string) =>
      dueRegistryReminders({
        trials: [trial({ timeZone })],
        submissions: [],
        now: new Date('2026-11-22T07:30:00Z'),
      }).length;
    expect(at('America/Los_Angeles')).toBe(0);
    expect(at(' America/Los_Angeles')).toBe(1);
  });

  describe('a corrected results file', () => {
    const sent = (at: string) => [{ organization: 'AKC', status: 'sent', submittedAt: at }];
    const run = (
      submissions: ReturnType<typeof sent>,
      scoreChanges: { trialId: string | null; changedAt: string }[] | undefined
    ) =>
      dueRegistryReminders({
        trials: [trial({ id: 't1' })],
        submissions,
        scoreChanges,
        now: NOON('2026-11-22'),
      });

    it('reopens the line when a score changed after the send, and names the corrected file', () => {
      const due = run(sent('2026-11-18T12:00:00Z'), [
        { trialId: 't1', changedAt: '2026-11-19T12:00:00Z' },
      ]);
      expect(due).toHaveLength(1);
      expect(due[0]).toMatchObject({ corrected: true, deadline: '2026-11-24' });
      expect(due[0]?.openLine).toBe(
        'Scores changed after the results file was sent to AKC. The corrected file has not been sent.'
      );
    });

    it('stays ticked when the change came before the send, or the history was not read', () => {
      expect(
        run(sent('2026-11-19T12:00:00Z'), [{ trialId: 't1', changedAt: '2026-11-18T12:00:00Z' }])
      ).toEqual([]);
      expect(run(sent('2026-11-18T12:00:00Z'), undefined)).toEqual([]);
      expect(run(sent('2026-11-18T12:00:00Z'), [])).toEqual([]);
    });

    it('is covered by a later recorded filing, like the list', () => {
      const rows = [
        ...sent('2026-11-18T12:00:00Z'),
        { organization: 'AKC', status: 'submitted', submittedAt: '2026-11-20T12:00:00Z' },
      ];
      expect(run(rows, [{ trialId: 't1', changedAt: '2026-11-19T12:00:00Z' }])).toEqual([]);
    });

    it("ignores a change in another registry's trial", () => {
      const trials = [trial({ id: 't1' }), trial({ id: 't2', registryId: 'ASCA' })];
      const due = dueRegistryReminders({
        trials,
        submissions: sent('2026-11-18T12:00:00Z'),
        scoreChanges: [{ trialId: 't2', changedAt: '2026-11-19T12:00:00Z' }],
        now: NOON('2026-11-22'),
      });
      expect(due.map(item => item.registryId)).not.toContain('AKC');
    });

    it('never reopens a registry whose file the secretary files herself', () => {
      const due = dueRegistryReminders({
        trials: [trial({ id: 't1', registryId: 'ASCA', date: '2026-11-10' })],
        submissions: [
          { organization: 'ASCA', status: 'submitted', submittedAt: '2026-11-11T12:00:00Z' },
        ],
        scoreChanges: [{ trialId: 't1', changedAt: '2026-11-12T12:00:00Z' }],
        now: NOON('2026-11-23'),
      });
      expect(due).toEqual([]);
    });
  });

  describe('time zone edge at midnight', () => {
    const open = (nowIso: string, timeZone: string) =>
      dueRegistryReminders({
        trials: [trial({ timeZone })],
        submissions: [],
        now: new Date(nowIso),
      }).length;

    it('does not fire early when UTC has already turned the day but the show has not', () => {
      // 2026-11-22T07:30Z is 23:30 on Nov 21 in Los Angeles: three days out there.
      expect(open('2026-11-22T07:30:00Z', 'America/Los_Angeles')).toBe(0);
      // Half an hour after local midnight it is Nov 22 in Los Angeles: two days out.
      expect(open('2026-11-22T08:30:00Z', 'America/Los_Angeles')).toBe(1);
    });

    it('fires on the show calendar day when the show is ahead of UTC', () => {
      // 2026-11-21T12:30Z is 01:30 on Nov 22 in Auckland, already two days out there.
      expect(open('2026-11-21T12:30:00Z', 'Pacific/Auckland')).toBe(1);
      // An hour earlier it is still Nov 21 in Auckland.
      expect(open('2026-11-21T10:30:00Z', 'Pacific/Auckland')).toBe(0);
    });
  });
});

describe('the reminder email', () => {
  const reminder = {
    registryId: 'AKC',
    deadline: '2026-11-24',
    daysUntil: 2,
    openLine: 'The results file has not been sent to AKC.',
    corrected: false,
  };

  it('names the open line, the date and the Finish the show list', () => {
    const url = finishListUrl('https://myk9show.com/', 'show-1');
    expect(url).toBe('https://myk9show.com/shows/show-1/results#finish-the-show');
    const html = buildRegistryDeadlineHtml({
      showName: 'Fall Scent Trial',
      reminder,
      finishUrl: url,
    });
    expect(html).toContain('Due at AKC by Tue, Nov 24');
    expect(html).toContain('The results file has not been sent to AKC.');
    expect(html).toContain('href="https://myk9show.com/shows/show-1/results#finish-the-show"');
    expect(buildRegistryDeadlineSubject('Fall Scent Trial', reminder)).toBe(
      'Fall Scent Trial: AKC results are due in 2 days'
    );
  });

  it('uses plain words: no em dashes, no emoji, show name escaped', () => {
    const html = buildRegistryDeadlineHtml({
      showName: '<b>Bad & Co</b>',
      reminder,
      finishUrl: 'https://myk9show.com/shows/x/results',
    });
    expect(html).not.toContain('—');
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(html).toContain('&lt;b&gt;Bad &amp; Co&lt;/b&gt;');
    expect(html).not.toContain('<b>Bad');
  });

  it('says today and tomorrow on the last two days', () => {
    expect(buildRegistryDeadlineSubject('S', { ...reminder, daysUntil: 1 })).toContain('tomorrow');
    expect(buildRegistryDeadlineSubject('S', { ...reminder, daysUntil: 0 })).toContain('today');
  });
});
