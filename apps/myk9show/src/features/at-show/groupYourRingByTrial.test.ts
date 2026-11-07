import { describe, expect, it } from 'vitest';
import type { ClassEntry } from '@myk9/ringside';
import { orderRingClassesByDay } from './orderRingClassesByDay';
import type { YourRingClass } from './atShowClassListSort';
import { defaultOpenYourRingGroupKeys, groupYourRingByTrial } from './groupYourRingByTrial';

const NOW = new Date('2026-10-16T15:00:00Z').getTime();

function card(id: string, trialId: string, trialDate: string, scanPriority = 1): YourRingClass {
  return {
    entry: { id, class_name: id, class_order: 1 } as ClassEntry,
    scanPriority,
    trialTimeZone: 'America/New_York',
    trialId,
    trialHeading: `Trial ${trialId} · ${trialDate}`,
    trialDate,
  };
}

function groupsFor(cards: YourRingClass[]) {
  return groupYourRingByTrial(orderRingClassesByDay(cards, NOW));
}

describe('groupYourRingByTrial', () => {
  it('makes one group per trial, today first, then upcoming soonest, then past most recent', () => {
    const groups = groupsFor([
      card('p1', 'P', '2026-10-14'),
      card('u2', 'U2', '2026-10-18'),
      card('t1', 'T', '2026-10-16'),
      card('u1', 'U1', '2026-10-17'),
      card('t2', 'T', '2026-10-16'),
    ]);
    expect(groups.map(g => [g.key, g.classes.map(c => c.entry.id)])).toEqual([
      ['T', ['t1', 't2']],
      ['U1', ['u1']],
      ['U2', ['u2']],
      ['P', ['p1']],
    ]);
    expect(groups[0]).toMatchObject({ label: 'Trial T · 2026-10-16', isToday: true });
  });

  it('groups a card with no trial id by its heading', () => {
    const a = { ...card('a', 'X', '2026-10-16'), trialId: undefined };
    const b = { ...card('b', 'X', '2026-10-16'), trialId: undefined };
    expect(groupsFor([a, b])).toHaveLength(1);
  });
});

describe('defaultOpenYourRingGroupKeys', () => {
  it('opens only the trial that is today', () => {
    const groups = groupsFor([
      card('t', 'T', '2026-10-16'),
      card('u', 'U', '2026-10-17'),
      card('p', 'P', '2026-10-15'),
    ]);
    expect([...defaultOpenYourRingGroupKeys(groups)]).toEqual(['T']);
  });

  it('opens every trial that is today', () => {
    const groups = groupsFor([
      card('a', 'A', '2026-10-16'),
      card('b', 'B', '2026-10-16'),
      card('u', 'U', '2026-10-17'),
    ]);
    expect([...defaultOpenYourRingGroupKeys(groups)]).toEqual(['A', 'B']);
  });

  it('with no trial today, opens the next upcoming one, not a past one', () => {
    const groups = groupsFor([
      card('p', 'P', '2026-10-15'),
      card('u2', 'U2', '2026-10-19'),
      card('u1', 'U1', '2026-10-17'),
    ]);
    expect([...defaultOpenYourRingGroupKeys(groups)]).toEqual(['U1']);
  });

  it('opens the most recent past trial when everything is over', () => {
    const groups = groupsFor([card('p1', 'P1', '2026-10-13'), card('p2', 'P2', '2026-10-15')]);
    expect([...defaultOpenYourRingGroupKeys(groups)]).toEqual(['P2']);
  });

  it('opens a single trial whatever its day, and nothing when empty', () => {
    expect([...defaultOpenYourRingGroupKeys(groupsFor([card('p', 'P', '2026-10-01')]))]).toEqual([
      'P',
    ]);
    expect(defaultOpenYourRingGroupKeys([]).size).toBe(0);
  });

  it('treats a live class as today work so its trial is open', () => {
    const groups = groupsFor([card('live', 'L', '2026-10-15', 0), card('u', 'U', '2026-10-17')]);
    expect([...defaultOpenYourRingGroupKeys(groups)]).toEqual(['L']);
  });
});
