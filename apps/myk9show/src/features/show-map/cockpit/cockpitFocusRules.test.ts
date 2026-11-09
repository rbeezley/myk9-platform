import { describe, expect, it } from 'vitest';

import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import { filtersUpdate, focusedPanelShows } from './cockpitFocusRules';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import type { SecretaryCockpitClass, SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

const baseClass = {
  classOrder: 0,
  lifecycle: 'not-started' as const,
  entryCount: 4,
  scoredCount: 0,
  actions: [],
  paperwork: [],
  entryRows: [],
  attention: [],
};

function snapshot(
  classes: SecretaryCockpitClass[],
  extra: Partial<SecretaryCockpitSnapshot> = {}
): SecretaryCockpitSnapshot {
  return {
    showId: 'show-1',
    timeZone: 'America/Chicago',
    registryId: 'AKC',
    now: new Date('2026-07-20T14:00:00.000Z'),
    printTrackingInUse: true,
    checklistInUse: true,
    trials: [
      { id: 't1', date: '2026-07-20', number: '1', order: 0 },
      { id: 't2', date: '2026-07-21', number: '2', order: 1 },
    ],
    classes,
    ...extra,
  };
}

const novice: SecretaryCockpitClass = { ...baseClass, id: 'c1', trialId: 't1', name: 'Novice' };
const running: SecretaryCockpitClass = {
  ...baseClass,
  id: 'c2',
  trialId: 't1',
  name: 'Advanced',
  lifecycle: 'in-progress',
};

// MYK9-1727 review: the panel must not vanish when the secretary's own work moves her picked
// class out of the filter, but a FILTER change that hides it lets it go.
describe('cockpit focus rules (MYK9-1727)', () => {
  it('keeps a picked class open when it no longer matches the ticked status', () => {
    // Novice was picked, then (say) completed elsewhere: "In progress" no longer lists it.
    const model = buildSecretaryCockpitModel(snapshot([novice, running]), {
      focusedClassId: 'c1',
      statuses: ['in-progress'],
    });
    expect(focusedPanelShows(model, 'c1')).toEqual({ shows: true, listed: false });
  });

  it('does not show the automatic default when the filter hides it', () => {
    const model = buildSecretaryCockpitModel(snapshot([novice]), { statuses: ['in-progress'] });
    expect(focusedPanelShows(model, undefined).shows).toBe(false);
  });

  it('lets the picked class go when a new filter would hide it, and keeps it when it matches', () => {
    const model = buildSecretaryCockpitModel(snapshot([novice, running]), {
      focusedClassId: 'c1',
    });
    expect(filtersUpdate(model, 'c1', {}, { statuses: ['in-progress'] })).toEqual({
      statuses: ['in-progress'],
      focusedClassId: undefined,
      anchor: undefined,
    });
    expect(filtersUpdate(model, 'c2', {}, { statuses: ['in-progress'] })).toEqual({
      statuses: ['in-progress'],
    });
    expect(filtersUpdate(model, undefined, {}, { statuses: ['in-progress'] })).toEqual({
      statuses: ['in-progress'],
    });
  });
});

describe('the show-level initials item (MYK9-1727 review)', () => {
  const needsInitials: SecretaryCockpitClass = {
    ...baseClass,
    id: 'sat',
    trialId: 't1',
    name: 'Saturday class',
    lifecycle: 'complete',
    wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
    attention: [
      {
        id: 'collect-judge-signature:class:sat',
        classId: 'sat',
        kind: 'closeout',
        label: "Collect judge's initials",
        reason: "Completed class still needs the judge's initials",
        destination: null,
      },
    ],
  };
  const sunday: SecretaryCockpitClass = { ...baseClass, id: 'sun', trialId: 't2', name: 'Sunday' };
  const showLevel = {
    id: 'classes-needing-signature',
    kind: 'blocker' as const,
    label: "1 class needs judge's initials",
    reason: "1 class needs judge's initials",
    destination: null,
  };
  const snap = snapshot([needsInitials, sunday], { administrativeAttention: [showLevel] });
  const ids = (selectedDays: string[]) =>
    buildSecretaryCockpitModel(snap, { selectedDays }).attention.all.map(item => item.id);

  it('drops the show-level item when the class carries its own, so one problem counts once', () => {
    expect(ids([])).toEqual(['collect-judge-signature:class:sat']);
  });

  it("keeps it when a day filter hides the class's own item, so Saturday is not forgotten", () => {
    expect(ids(['2026-07-21'])).toContain('classes-needing-signature');
  });
});
