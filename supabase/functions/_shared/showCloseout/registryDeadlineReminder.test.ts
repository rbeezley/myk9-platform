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
