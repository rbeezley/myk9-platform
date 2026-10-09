/**
 * MYK9-1009: the judge's sign-off wording follows the show's registry. AKC has the
 * judge initial each catalog page (Ch.3 §37); UKC and ASCA keep signature + date and
 * must read exactly as they did before the AKC change.
 */
import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import { getRecommendedActions } from '../showMapActions';
import { classifyClassWrapUpStatus } from '../showMapStatus';
import { computeShowDeskPendingSignals } from '../showDeskPendingSignals';
import { buildClassChecklist } from '../cockpit/classChecklist';
import { judgeSignOffWording } from '../judgeSignOff';
import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

const show = { id: 'show-1', name: 'Spring Trial', organization: 'AKC' } as Show;

function trialFor(registryId: string): SyncableTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    trialDate: '2026-05-11',
    trialNumber: '1',
    status: 'In Progress',
    registryId,
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  } as SyncableTrial;
}

function needsSignOffTree(registryId: string) {
  return buildShowMapTree({
    show,
    trials: [trialFor(registryId)],
    classes: [
      { id: 'c1', trialId: 'trial-1', name: 'Container Novice A', status: 'Complete' },
    ] as never,
    entries: [{ id: 'e1', class_id: 'c1', is_scored: true }],
  });
}

const WRAP_UP_CLASS = { status: 'Complete' } as never;
// MYK9-1030: the sign-off is on the class (judge_signed_off_at), not on its entries.
const SIGNED_CLASS = { status: 'Complete', judgeSignedOffAt: '2026-05-18T20:00:00Z' } as never;
const SCORED = [{ is_scored: true }];

describe('judge sign-off wording by registry', () => {
  it('AKC says initials and everything else keeps the signature wording', () => {
    expect(judgeSignOffWording('AKC').actionLabel).toBe("Collect judge's initials");
    expect(judgeSignOffWording(undefined).actionLabel).toBe("Collect judge's initials");
    for (const registry of ['UKC', 'ASCA']) {
      expect(judgeSignOffWording(registry)).toMatchObject({
        actionLabel: 'Collect judge signature',
        actionWhy: 'Completed class still needs judge sign-off',
        needsStatusLabel: 'Needs judge signature',
        doneStatusLabel: 'Signed by judge',
        checklistLabel: 'Judge signature collected',
        checklistNoneDetail: 'No entries to sign',
        resultsControlInstruction: 'Verify judge signatures on the paper reports before sending.',
      });
      expect(judgeSignOffWording(registry).pendingSignalLabel(2)).toBe(
        '2 classes need judge signature'
      );
    }
    expect(judgeSignOffWording('AKC').pendingSignalLabel(1)).toBe("1 class needs judge's initials");
  });

  it.each([
    ['AKC', "Collect judge's initials"],
    ['UKC', 'Collect judge signature'],
  ])('labels the wrap-up action for %s', (registry, label) => {
    const actions = getRecommendedActions('root', { tree: needsSignOffTree(registry) });
    expect(actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'collect-judge-signature', label })])
    );
  });

  it.each([
    ['AKC', "Needs judge's initials", 'Initialed by judge'],
    ['UKC', 'Needs judge signature', 'Signed by judge'],
  ])('labels the class wrap-up status for %s', (registryId, needs, done) => {
    expect(classifyClassWrapUpStatus(WRAP_UP_CLASS, SCORED, { registryId })).toMatchObject({
      value: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
      label: needs,
    });
    expect(classifyClassWrapUpStatus(SIGNED_CLASS, SCORED, { registryId })).toMatchObject({
      value: SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
      label: done,
    });
  });

  it.each([
    ['AKC', 'Record initials: Pat Donovan, Wed, Oct 7', 'Initialed by judge'],
    ['UKC', 'Record signature: Pat Donovan, Wed, Oct 7', 'Signed by judge'],
  ])(
    'MYK9-1049: the %s record action states the action, never the done status',
    (registryId, action, done) => {
      const wording = judgeSignOffWording(registryId);
      expect(wording.recordActionLabel('Pat Donovan', 'Wed, Oct 7')).toBe(action);
      expect(wording.recordActionLabel('Pat Donovan', 'Wed, Oct 7')).not.toMatch(
        /^(Initialed|Signed) by/
      );
      expect(wording.doneStatusLabel).toBe(done);
    }
  );

  it('puts the registry on the trial and class nodes the tree builds', () => {
    const tree = needsSignOffTree('UKC');
    expect(tree.nodesById['class:c1']?.registryId).toBe('UKC');
    expect(tree.nodesById['class:c1']?.wrapUpStatus?.label).toBe('Needs judge signature');
  });

  it.each([
    ['AKC', "Judge's initials collected", 'No entries to initial'],
    ['UKC', 'Judge signature collected', 'No entries to sign'],
  ])('labels the class checklist item for %s', (registryId, label, noneDetail) => {
    const todo = buildClassChecklist({
      lifecycle: 'complete',
      entryCount: 3,
      scoredCount: 3,
      wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
      registryId,
      paperwork: [],
    }).find(item => item.id === 'judge-signature');
    expect(todo?.label).toBe(label);

    const none = buildClassChecklist({
      lifecycle: 'complete',
      entryCount: 3,
      scoredCount: 3,
      wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
      registryId,
      paperwork: [],
    }).find(item => item.id === 'judge-signature');
    expect(none?.detail).toBe(noneDetail);
  });

  it.each([
    ['AKC', "1 class needs judge's initials"],
    ['UKC', '1 class needs judge signature'],
  ])('labels the pending signal for %s', (registry, label) => {
    const signals = computeShowDeskPendingSignals({
      showId: 'show-1',
      tree: needsSignOffTree(registry),
      entries: [],
    } as never);
    expect(signals.find(signal => signal.id === 'classes-needing-signature')?.label).toBe(label);
  });
});

describe('record action wording without a judge (MYK9-1031)', () => {
  it('reads naturally when no judge is set, in both registries', () => {
    expect(judgeSignOffWording('AKC').recordActionLabel(undefined, 'Mon, Nov 9')).toBe(
      'Record initials: Mon, Nov 9'
    );
    expect(judgeSignOffWording('UKC').recordActionLabel('  ', 'Mon, Nov 9')).toBe(
      'Record signature: Mon, Nov 9'
    );
    expect(judgeSignOffWording('AKC').recordActionLabel('Pat Donovan', '')).toBe(
      'Record initials: Pat Donovan'
    );
  });
});
