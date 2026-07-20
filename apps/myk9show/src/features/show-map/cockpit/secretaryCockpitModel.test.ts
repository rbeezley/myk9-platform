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
    ...input,
  };
}

function makeSnapshot(overrides: Partial<SecretaryCockpitSnapshot> = {}): SecretaryCockpitSnapshot {
  return {
    showId: 'show-1',
    timeZone: 'America/Chicago',
    now: NOW,
    trials: [
      { id: 'trial-1', date: '2026-07-20', number: '1', order: 0 },
      { id: 'trial-2', date: '2026-07-20', number: '2', order: 1 },
      { id: 'trial-3', date: '2026-07-21', number: '3', order: 2 },
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
            label: 'Enter paper scores',
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
      { filter: 'all' }
    );

    expect(model.trialGroups[0]?.classes[0]?.timeLabel).toBe('10:12 AM');
  });

  it('selects the relevant day before, during, and after the Show', () => {
    expect(buildSecretaryCockpitModel(makeSnapshot(), { filter: 'all' }).day.selected).toBe(
      '2026-07-20'
    );

    const before = makeSnapshot({ now: new Date('2026-07-19T14:00:00.000Z') });
    expect(buildSecretaryCockpitModel(before, { filter: 'all' }).day.selected).toBe('2026-07-20');

    const after = makeSnapshot({ now: new Date('2026-07-23T14:00:00.000Z') });
    expect(buildSecretaryCockpitModel(after, { filter: 'all' }).day.selected).toBe('2026-07-21');
  });

  it('groups Trials in configured order and keeps timed, tied, then untimed Classes stable', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { filter: 'all' });

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
      { filter: 'all' }
    );

    expect(model.trialGroups[0]?.label).toBe('Saturday Trial · July 20');
  });

  it('sorts by Scheduled Start and leaves a slipped Class in its original position', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { filter: 'all' });
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

    const model = buildSecretaryCockpitModel(snapshot, { filter: 'all' });
    expect(model.trialGroups[0]?.classes.map(item => item.id)).toEqual([
      'complete',
      'active',
      'active-tie',
    ]);
  });

  it('places a current-time marker in each applicable Trial without manufacturing one for untimed rows', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { filter: 'all' });

    expect(model.trialGroups[0]?.nowMarkerIndex).toBe(1);
    expect(model.trialGroups[1]?.nowMarkerIndex).toBe(0);
  });
});

describe('buildSecretaryCockpitModel focus and filtering', () => {
  it('initially focuses the earliest active Class and never steals an explicit valid focus', () => {
    expect(buildSecretaryCockpitModel(makeSnapshot(), { filter: 'all' }).focusedClass?.id).toBe(
      'active'
    );

    const focused = buildSecretaryCockpitModel(makeSnapshot(), {
      filter: 'all',
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
        filter: 'all',
        focusedClassId: focused.focusedClass?.id,
      }).focusedClass?.id
    ).toBe('upcoming');
  });

  it('filters only schedule rows while preserving the focused Class model', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      filter: 'in-progress',
      focusedClassId: 'upcoming',
    });

    expect(model.trialGroups.flatMap(group => group.classes.map(row => row.id))).toEqual([
      'active',
    ]);
    expect(model.focusedClass?.id).toBe('upcoming');
  });

  it('includes a Class with only a generated preparation reminder in Needs attention', () => {
    const snapshot = makeSnapshot({
      classes: makeSnapshot().classes.map(cls =>
        cls.id === 'upcoming' ? { ...cls, attention: [] } : cls
      ),
    });
    const model = buildSecretaryCockpitModel(snapshot, { filter: 'needs-attention' });

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
    const model = buildSecretaryCockpitModel(snapshot, { filter: 'all' });

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
    const model = buildSecretaryCockpitModel(snapshot, { filter: 'all' });

    expect(model.attention.all).toContainEqual(
      expect.objectContaining({ id: 'no-destination', destination: null })
    );
  });

  it('adds a calm preparation reminder inside 30 minutes and uses next-in-order for missing time', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), { filter: 'all' });
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
    const missingTimeModel = buildSecretaryCockpitModel(missingTimeSnapshot, { filter: 'all' });
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
      buildSecretaryCockpitModel(snapshot, { filter: 'all' }).attention.all.find(
        item => item.id === 'prepare:upcoming:check-in-sheet'
      )
    ).toBeUndefined();
  });
});

describe('buildSecretaryCockpitModel truth projection', () => {
  it('keeps unknown evidence unknown and does not infer Operational Area from Judge', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      filter: 'all',
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
      filter: 'all',
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
      filter: 'all',
      focusedClassId: 'active',
    });
    expect(ring.focusedClass?.operationalArea.value).toEqual({ kind: 'ring', label: 'Ring 2' });
  });

  it('classifies lifecycle as recorded, progress as computed, and action groups outside lifecycle', () => {
    const model = buildSecretaryCockpitModel(makeSnapshot(), {
      filter: 'all',
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
