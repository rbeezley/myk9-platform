import { describe, expect, it } from 'vitest';

import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import type { SecretaryCockpitClass, SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

const NOW = new Date('2026-07-20T14:42:00.000Z');

function makeClass(
  input: Partial<SecretaryCockpitClass> & Pick<SecretaryCockpitClass, 'id' | 'trialId' | 'name'>
): SecretaryCockpitClass {
  return {
    classOrder: 0,
    lifecycle: 'not-started',
    entryCount: 10,
    scoredCount: 0,
    actions: [],
    attention: [],
    paperwork: [],
    entryRows: [],
    ...input,
  };
}

function makeSnapshot(overrides: Partial<SecretaryCockpitSnapshot> = {}): SecretaryCockpitSnapshot {
  return {
    showId: 'show-1',
    timeZone: 'America/Chicago',
    registryId: 'AKC',
    now: NOW,
    printTrackingInUse: true,
    checklistInUse: true,
    trials: [
      { id: 'trial-1', date: '2026-07-20', name: 'Trial 1', number: 'Trial 1', order: 0 },
      { id: 'trial-2', date: '2026-07-20', name: 'Trial 2', number: 'Trial 2', order: 1 },
      { id: 'trial-3', date: '2026-07-21', name: 'Trial 3', number: 'Trial 3', order: 2 },
    ],
    classes: [
      makeClass({
        id: 'complete',
        trialId: 'trial-1',
        name: 'Buried Novice B',
        classOrder: 0,
        scheduledStart: '09:00',
        lifecycle: 'complete',
        scoredCount: 10,
        closeout: 'needs-closeout',
        operationalArea: { kind: 'search-area', labels: ['Gym · Search Area 2'] },
        attention: [
          {
            id: 'closeout',
            dedupeKey: 'complete:closeout',
            kind: 'closeout',
            label: 'Finish closeout',
            reason: 'Results need review',
            destination: { kind: 'href', href: '/class/complete' },
          },
        ],
      }),
      makeClass({
        id: 'active',
        trialId: 'trial-1',
        name: 'Interior Advanced',
        classOrder: 1,
        scheduledStart: '10:00',
        revisedExpectedStart: '10:12',
        lifecycle: 'in-progress',
        scoredCount: 8,
        operationalArea: { kind: 'search-area', labels: ['Kitchen · Search Area 1'] },
        attention: [
          {
            id: 'scores',
            dedupeKey: 'active:scores',
            kind: 'active-work',
            label: 'Enter results from scoresheet',
            reason: '2 paper scores still need entry',
            destination: { kind: 'href', href: '/scoring/active' },
          },
        ],
      }),
      makeClass({
        id: 'upcoming',
        trialId: 'trial-2',
        name: 'Container Novice A',
        scheduledStart: '10:00',
        lifecycle: 'not-started',
        operationalArea: { kind: 'search-area', labels: ['Gym · Search Area 1'] },
        attention: [
          {
            id: 'move-up',
            dedupeKey: 'upcoming:move-up',
            kind: 'blocker',
            label: 'Review move-up',
            reason: 'Move-up request blocks the upcoming Class',
            destination: { kind: 'href', href: '/entries/upcoming' },
          },
        ],
        paperwork: [
          {
            reportId: 'check-in-sheet',
            label: 'Check-in sheet',
            state: 'unconfirmed',
            printHref: '/reports/check-in/upcoming',
          },
        ],
      }),
      makeClass({
        id: 'untimed',
        trialId: 'trial-2',
        name: 'Exterior Excellent',
        classOrder: 1,
        lifecycle: 'not-started',
        judgeName: 'Judge Morgan',
        operationalArea: null,
        paperwork: [
          {
            reportId: 'scoresheet',
            label: 'Score sheets',
            state: 'unknown',
            printHref: '/reports/scores/untimed',
          },
        ],
      }),
      makeClass({
        id: 'tomorrow',
        trialId: 'trial-3',
        name: 'Container Master',
        scheduledStart: '08:30',
        lifecycle: 'not-started',
        closeout: 'needs-closeout',
      }),
    ],
    ...overrides,
  };
}

describe('buildSecretaryCockpitModel schedule projection', () => {
  it('formats a revised instant in the Trial timezone', () => {
    const model = buildSecretaryCockpitModel(
      makeSnapshot({
        classes: [
          makeClass({
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Container Novice',
            scheduledStart: '9:00 AM',
            revisedExpectedStart: '2026-07-20T15:12:00.000Z',
          }),
        ],
      }),
      { statuses: [] }
    );

    expect(model.trialGroups[0]?.classes[0]?.timeLabel).toBe('10:12 AM');
  });

  it('selects the relevant day before, during, and after the Show', () => {
    expect(buildSecretaryCockpitModel(makeSnapshot(), { statuses: [] }).day.selected).toBe(
      '2026-07-20'
    );

    const before = makeSnapshot({ now: new Date('2026-07-19T14:00:00.000Z') });
    expect(buildSecretaryCockpitModel(before, { statuses: [] }).day.selected).toBe('2026-07-20');

    const after = makeSnapshot({ now: new Date('2026-07-23T14:00:00.000Z') });
    expect(buildSecretaryCockpitModel(after, { statuses: [] }).day.selected).toBe('2026-07-21');
  });

  it('groups Trials in configured order and keeps timed, tied, then untimed Classes stable', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      statuses: [],
      selectedDays: ['2026-07-20'],
    });

    expect(model.trialGroups.map(group => group.trialId)).toEqual(['trial-1', 'trial-2']);
    expect(model.trialGroups[0]?.label).toBe('Trial 1 · July 20');
    expect(model.trialGroups[0]?.classes.map(row => row.id)).toEqual(['complete', 'active']);
    expect(model.trialGroups[1]?.classes.map(row => row.id)).toEqual(['upcoming', 'untimed']);
    expect(model.trialGroups[1]?.classes[1]?.timeLabel).toBe('Time not set');
  });

  it('does not add another Trial prefix to a descriptive Trial number', () => {
    const model = buildSecretaryCockpitModel(
      makeSnapshot({
        trials: [{ id: 'trial-1', date: '2026-07-20', number: 'Saturday Trial', order: 0 }],
      }),
      { statuses: [] }
    );

    expect(model.trialGroups[0]?.label).toBe('Saturday Trial · July 20');
  });

  it('sorts by Scheduled Start and leaves a slipped Class in its original position', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { statuses: [] });
    const row = model.trialGroups[0]?.classes.find(item => item.id === 'active');

    expect(row).toMatchObject({
      expectedStart: '10:12',
      scheduledStart: '10:00',
    });
    expect(model.trialGroups[0]?.classes.map(item => item.id)).toEqual(['complete', 'active']);
  });

  it('preserves configured order when Classes in one Trial share a Scheduled Start', () => {
    const base = makeSnapshot();
    const snapshot = makeSnapshot({
      classes: [
        ...base.classes,
        makeClass({
          id: 'active-tie',
          trialId: 'trial-1',
          name: 'Interior Excellent',
          classOrder: 2,
          scheduledStart: '10:00',
          lifecycle: 'in-progress',
        }),
      ],
    });

    const model = buildSecretaryCockpitModel(snapshot, { statuses: [] });
    expect(model.trialGroups[0]?.classes.map(item => item.id)).toEqual([
      'complete',
      'active',
      'active-tie',
    ]);
  });

  it('places a current-time marker in each applicable Trial without manufacturing one for untimed rows', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { statuses: [] });

    expect(model.trialGroups[0]?.nowMarkerIndex).toBe(1);
    expect(model.trialGroups[1]?.nowMarkerIndex).toBe(0);
  });
});

describe('buildSecretaryCockpitModel focus and filtering', () => {
  it('initially focuses the earliest active Class and never steals an explicit valid focus', () => {
    expect(buildSecretaryCockpitModel(makeSnapshot(), { statuses: [] }).focusedClass?.id).toBe(
      'active'
    );

    const focused = buildSecretaryCockpitModel(makeSnapshot(), {
      statuses: [],
      focusedClassId: 'upcoming',
    });
    expect(focused.focusedClass?.id).toBe('upcoming');

    const changed = makeSnapshot({
      classes: makeSnapshot().classes.map(cls =>
        cls.id === 'complete'
          ? {
              ...cls,
              attention: [
                {
                  id: 'new-blocker',
                  kind: 'blocker' as const,
                  label: 'Urgent conflict',
                  reason: 'New replicated issue',
                  destination: { kind: 'href' as const, href: '/urgent' },
                },
              ],
            }
          : cls
      ),
    });
    expect(
      buildSecretaryCockpitModel(changed, {
        statuses: [],
        focusedClassId: focused.focusedClass?.id,
      }).focusedClass?.id
    ).toBe('upcoming');
  });

  it('filters only schedule rows while preserving the focused Class model', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      statuses: ['in-progress'],
      focusedClassId: 'upcoming',
    });

    expect(model.trialGroups.flatMap(group => group.classes.map(row => row.id))).toEqual([
      'active',
    ]);
    expect(model.focusedClass?.id).toBe('upcoming');
  });

  it('shows a Class matching ANY ticked status, and the union is wider than each tick (MYK9-1727)', () => {
    const snapshot = makeSnapshot();
    const ids = (statuses: readonly ('in-progress' | 'needs-attention' | 'needs-closeout')[]) =>
      buildSecretaryCockpitModel(snapshot, { statuses })
        .trialGroups.flatMap(group => group.classes.map(row => row.id))
        .sort();
    const inProgress = ids(['in-progress']);
    const closeout = ids(['needs-closeout']);

    expect(inProgress.length).toBeGreaterThan(0);
    expect(closeout.length).toBeGreaterThan(0);
    expect(ids(['in-progress', 'needs-closeout'])).toEqual(
      [...new Set([...inProgress, ...closeout])].sort()
    );
    expect(ids(['in-progress', 'needs-closeout']).length).toBeGreaterThan(
      Math.max(inProgress.length, closeout.length)
    );
  });

  it('includes a Class with only a generated preparation reminder in Needs attention', () => {
    const snapshot = makeSnapshot({
      classes: makeSnapshot().classes.map(cls =>
        cls.id === 'upcoming' ? { ...cls, attention: [] } : cls
      ),
    });
    const model = buildSecretaryCockpitModel(snapshot, { statuses: ['needs-attention'] });

    expect(model.trialGroups.flatMap(group => group.classes.map(row => row.id))).toContain(
      'upcoming'
    );
    expect(
      model.trialGroups.flatMap(group => group.classes).find(row => row.id === 'upcoming')
        ?.attentionCount
    ).toBe(1);
  });
});

describe('buildSecretaryCockpitModel attention projection', () => {
  it('deduplicates, ranks blockers before active work and closeout, and truncates to three', () => {
    const snapshot = makeSnapshot({
      classes: makeSnapshot().classes.map(cls =>
        cls.id === 'upcoming'
          ? {
              ...cls,
              attention: [...cls.attention, { ...cls.attention[0]!, id: 'duplicate-move-up' }],
            }
          : cls
      ),
      administrativeAttention: [
        {
          id: 'admin',
          kind: 'administrative',
          label: 'Review payment',
          reason: 'Payment follow-up',
          destination: { kind: 'href', href: '/payments' },
        },
      ],
    });
    const model = buildSecretaryCockpitModel(snapshot, { statuses: [] });

    expect(model.attention.items.map(item => item.id)).toEqual([
      'move-up',
      'scores',
      'prepare:upcoming:check-in-sheet',
    ]);
    expect(model.attention.overflowCount).toBe(2);
  });

  it('keeps unresolved issues informational without inventing a destination', () => {
    const snapshot = makeSnapshot({
      administrativeAttention: [
        {
          id: 'no-destination',
          kind: 'blocker',
          label: 'Unknown conflict',
          reason: 'No verified owner exists',
          destination: null,
        },
      ],
    });
    const model = buildSecretaryCockpitModel(snapshot, { statuses: [] });

    expect(model.attention.all).toContainEqual(
      expect.objectContaining({ id: 'no-destination', destination: null })
    );
  });

  it('adds a calm preparation reminder inside 30 minutes and uses next-in-order for missing time', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { statuses: [] });
    const timed = model.attention.all.find(item => item.id === 'prepare:upcoming:check-in-sheet');

    const missingTimeSnapshot = makeSnapshot({
      classes: makeSnapshot().classes.map(cls =>
        cls.id === 'upcoming'
          ? {
              ...cls,
              lifecycle: 'complete' as const,
              paperwork: cls.paperwork.map(item => ({ ...item, state: 'current' as const })),
            }
          : cls
      ),
    });
    const missingTimeModel = buildSecretaryCockpitModel(missingTimeSnapshot, { statuses: [] });
    const untimed = missingTimeModel.attention.all.find(
      item => item.id === 'prepare:untimed:scoresheet'
    );

    expect(timed?.reason).toContain('not confirmed printed');
    expect(timed?.reason).toContain('18 minutes');
    expect(untimed?.reason).toContain('next in schedule order');
  });

  it('uses Revised Expected Start instead of Scheduled Start for preparation urgency', () => {
    const snapshot = makeSnapshot({
      classes: makeSnapshot().classes.map(cls =>
        cls.id === 'upcoming' ? { ...cls, revisedExpectedStart: '2026-07-20T16:00:00.000Z' } : cls
      ),
    });

    expect(
      buildSecretaryCockpitModel(snapshot, { statuses: [] }).attention.all.find(
        item => item.id === 'prepare:upcoming:check-in-sheet'
      )
    ).toBeUndefined();
  });
});

describe('buildSecretaryCockpitModel truth projection', () => {
  it('keeps unknown evidence unknown and does not infer Operational Area from Judge', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      statuses: [],
      focusedClassId: 'untimed',
    });

    expect(model.focusedClass?.operationalArea).toEqual({ evidence: 'unknown', value: null });
    expect(model.focusedClass?.operationalArea.value).not.toBe('Judge Morgan');
    expect(model.focusedClass?.paperwork[0]).toMatchObject({
      evidence: 'unknown',
      state: 'unknown',
    });
  });

  it('preserves sport-aware Operational Area kind and supplied wording', () => {
    const scent = buildSecretaryCockpitModel(makeSnapshot(), {
      statuses: [],
      focusedClassId: 'active',
    });
    expect(scent.focusedClass?.operationalArea).toEqual({
      evidence: 'recorded',
      value: { kind: 'search-area', label: 'Kitchen · Search Area 1' },
    });

    const ringSnapshot = makeSnapshot({
      classes: makeSnapshot().classes.map(cls =>
        cls.id === 'active'
          ? { ...cls, operationalArea: { kind: 'ring' as const, labels: ['Ring 2'] } }
          : cls
      ),
    });
    const ring = buildSecretaryCockpitModel(ringSnapshot, {
      statuses: [],
      focusedClassId: 'active',
    });
    expect(ring.focusedClass?.operationalArea.value).toEqual({ kind: 'ring', label: 'Ring 2' });
  });

  it('classifies lifecycle as recorded, progress as computed, and action groups outside lifecycle', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      statuses: [],
      focusedClassId: 'active',
    });

    expect(model.focusedClass?.lifecycle).toEqual({ evidence: 'recorded', value: 'in-progress' });
    expect(model.focusedClass?.progress).toEqual({
      evidence: 'computed',
      value: { completed: 8, total: 10 },
    });
    expect(model.focusedClass).toHaveProperty('prepareActions');
    expect(model.focusedClass).toHaveProperty('finishActions');
    expect(['not-started', 'in-progress', 'complete', 'cancelled']).toContain(
      model.focusedClass?.lifecycle.value
    );
  });
});

// MYK9-955 / MYK9-953 decisions 2 and 3, and collapsible trials (owner, 2026-10-02).
describe('buildSecretaryCockpitModel show home', () => {
  it('opens on the last show day after the show, even with closeout left on an earlier day', () => {
    const after = makeSnapshot({
      now: new Date('2026-07-23T14:00:00.000Z'),
      classes: makeSnapshot().classes.map(cls =>
        cls.id === 'tomorrow' ? { ...cls, closeout: 'none' as const } : cls
      ),
    });

    expect(buildSecretaryCockpitModel(after, { statuses: [] }).day.selected).toBe('2026-07-21');
  });

  it('shows every trial in All days, opening only the default day', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { statuses: [], selectedDays: [] });

    expect(model.day).toMatchObject({ allDays: true, selected: '2026-07-20' });
    expect(model.trialGroups.map(group => [group.trialId, group.defaultOpen])).toEqual([
      ['trial-1', true],
      ['trial-2', true],
      ['trial-3', false],
    ]);
    // The now marker belongs to today's trials only.
    expect(model.trialGroups.map(group => group.nowMarkerIndex)).toEqual([1, 0, null]);
    // Work on another day still surfaces, so nothing hides behind a collapsed group.
    expect(model.daySchedule.map(row => row.id)).toContain('tomorrow');
  });

  it('opens the trial the URL anchors on in All days, even on another day (MYK9-1320)', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      statuses: [],
      selectedDays: [],
      anchor: 'trial-3',
    });

    expect(model.trialGroups.map(group => [group.trialId, group.defaultOpen])).toEqual([
      ['trial-1', true],
      ['trial-2', true],
      ['trial-3', true],
    ]);
  });

  it('opens every trial when one day is chosen', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      statuses: [],
      selectedDays: ['2026-07-21'],
    });

    expect(model.day.allDays).toBe(false);
    expect(model.trialGroups.map(group => [group.trialId, group.defaultOpen])).toEqual([
      ['trial-3', true],
    ]);
  });

  describe('MYK9-1719: several ticked days', () => {
    const threeDays = () =>
      makeSnapshot({
        trials: [
          ...makeSnapshot().trials,
          { id: 'trial-4', date: '2026-07-22', name: 'Trial 4', number: 'Trial 4', order: 3 },
        ],
      });

    it('shows only the ticked days, opening the default day when it is in scope', () => {
      const model = buildSecretaryCockpitModel(threeDays(), {
        statuses: [],
        selectedDays: ['2026-07-22', '2026-07-20'],
      });

      expect(model.day).toMatchObject({
        allDays: false,
        days: ['2026-07-20', '2026-07-22'],
        selected: '2026-07-20',
        isToday: false,
      });
      expect(model.trialGroups.map(group => [group.trialId, group.defaultOpen])).toEqual([
        ['trial-1', true],
        ['trial-2', true],
        ['trial-4', false],
      ]);
      expect(model.daySchedule.map(row => row.id)).not.toContain('tomorrow');
    });

    it('falls back to the earliest ticked day when the default day is out of scope', () => {
      const model = buildSecretaryCockpitModel(threeDays(), {
        statuses: [],
        selectedDays: ['2026-07-22', '2026-07-21'],
      });

      expect(model.day.selected).toBe('2026-07-21');
      expect(model.trialGroups.map(group => [group.trialId, group.defaultOpen])).toEqual([
        ['trial-3', true],
        ['trial-4', false],
      ]);
    });

    it('none ticked, or every day ticked, means all days', () => {
      const none = buildSecretaryCockpitModel(threeDays(), { statuses: [], selectedDays: [] });
      const every = buildSecretaryCockpitModel(threeDays(), {
        statuses: [],
        selectedDays: ['2026-07-20', '2026-07-21', '2026-07-22'],
      });

      expect(none.day.allDays).toBe(true);
      expect(every.day.allDays).toBe(true);
      expect(every.trialGroups.map(group => group.trialId)).toEqual(
        none.trialGroups.map(group => group.trialId)
      );
      expect(none.trialGroups).toHaveLength(4);
    });

    it('ignores ticks that name no day of the show', () => {
      const model = buildSecretaryCockpitModel(threeDays(), {
        statuses: [],
        selectedDays: ['2026-01-01'],
      });

      expect(model.day).toMatchObject({ allDays: true, days: [] });
    });

    it('is "today" only when exactly today is ticked', () => {
      const today = '2026-07-20';
      expect(
        buildSecretaryCockpitModel(threeDays(), { statuses: [], selectedDays: [today] }).day.isToday
      ).toBe(true);
      expect(
        buildSecretaryCockpitModel(threeDays(), { statuses: [], selectedDays: [] }).day.isToday
      ).toBe(false);
      expect(
        buildSecretaryCockpitModel(threeDays(), {
          statuses: [],
          selectedDays: [today, '2026-07-21'],
        }).day.isToday
      ).toBe(false);
    });
  });

  it('keeps the default focus on the default day in All days', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { statuses: [], selectedDays: [] });

    expect(model.focusedClass?.id).toBe('active');
  });

  it('stays quiet before the show: no "starts in" reminder for a class tomorrow', () => {
    // 09:35 in Chicago on July 19; `upcoming` starts 10:00 on July 20.
    const before = makeSnapshot({ now: new Date('2026-07-19T14:35:00.000Z') });
    const model = buildSecretaryCockpitModel(before, { statuses: [], selectedDays: [] });

    expect(model.attention.all.filter(item => item.kind === 'preparation')).toEqual([]);
    expect(model.trialGroups.every(group => group.nowMarkerIndex === null)).toBe(true);
  });

  it('carries the checklist count on each row', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { statuses: [] });
    const complete = model.trialGroups[0]?.classes.find(row => row.id === 'complete');

    expect(complete?.checklist).toMatchObject({ total: 7 });
    expect(complete?.checklist?.done).toBeGreaterThan(0);
  });
});

describe('the schedule shows the real start once a class has started (owner, 2026-10-03)', () => {
  function rowFor(cls: SecretaryCockpitClass) {
    const model = buildSecretaryCockpitModel(
      makeSnapshot({ classes: [cls], trials: [makeSnapshot().trials[0]!] }),
      { statuses: [] }
    );
    return model.daySchedule.find(row => row.id === cls.id);
  }

  it('labels a started class with its recorded start, in show time', () => {
    const row = rowFor(
      makeClass({
        id: 'running',
        trialId: 'trial-1',
        name: 'Interior Novice',
        lifecycle: 'in-progress',
        scheduledStart: '9:00 AM',
        actualStart: '2026-07-20T14:12:00.000Z',
      })
    );
    expect(row?.startedLabel).toBe('9:12 AM');
  });

  it('keeps the planned time before the class starts, or when no start was recorded', () => {
    expect(
      rowFor(
        makeClass({
          id: 'planned',
          trialId: 'trial-1',
          name: 'Interior Novice',
          scheduledStart: '9:00 AM',
          // A stale stamp on a reset class must not read as a start.
          actualStart: '2026-07-20T14:12:00.000Z',
        })
      )?.startedLabel
    ).toBeNull();
    expect(
      rowFor(
        makeClass({
          id: 'unstamped',
          trialId: 'trial-1',
          name: 'Interior Novice',
          lifecycle: 'complete',
          scheduledStart: '9:00 AM',
        })
      )?.startedLabel
    ).toBeNull();
  });
});

describe('buildSecretaryCockpitModel unused print tracking and checklist (MYK9-1620)', () => {
  const unused = () => makeSnapshot({ printTrackingInUse: false, checklistInUse: false });
  const rows = (model: ReturnType<typeof buildSecretaryCockpitModel>) =>
    model.trialGroups.flatMap(group => group.classes);

  it('shows no checklist strip and no Prepare chips on a show that never used them', () => {
    const model = buildSecretaryCockpitModel(unused(), { statuses: [] });

    expect(rows(model).map(row => row.checklist)).toEqual(rows(model).map(() => null));
    expect(model.attention.all.map(item => item.id)).not.toContain(
      'prepare:upcoming:check-in-sheet'
    );
    expect(model.attention.all.some(item => item.kind === 'preparation')).toBe(false);
    // Other attention (blockers, active work, closeout) is untouched.
    expect(model.attention.all.map(item => item.id)).toEqual(
      expect.arrayContaining(['move-up', 'scores'])
    );
    expect(model.focusedClass).toMatchObject({ printTrackingInUse: false, checklistInUse: false });
  });

  it('shows the strip and Prepare chips on every class once the show uses them', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { statuses: [] });

    expect(rows(model).filter(row => row.id !== 'complete')).toSatisfy(
      (list: ReturnType<typeof rows>) => list.every(row => row.checklist !== null)
    );
    expect(model.attention.all.map(item => item.id)).toContain('prepare:upcoming:check-in-sheet');
    expect(model.focusedClass).toMatchObject({ printTrackingInUse: true, checklistInUse: true });
  });

  it('keeps the strip but drops Prepare chips when only a sign-off was recorded', () => {
    const model = buildSecretaryCockpitModel(
      makeSnapshot({ printTrackingInUse: false, checklistInUse: true }),
      { statuses: [] }
    );

    expect(rows(model).every(row => row.checklist !== null)).toBe(true);
    expect(model.attention.all.some(item => item.kind === 'preparation')).toBe(false);
  });
});
