/**
 * MYK9-1030: the judge initials (AKC) or signs (UKC, ASCA) the marked catalog ONCE, at the end of
 * their day, for every class they judged that day. So a completed class whose judge still has a
 * class to run that day waits quietly, and only nags once that judge's last class is done.
 *
 * Built through buildShowMapTree, the way the Show Desk builds it, so the judge's day is decided
 * across trials and the status, actions, checklist and pending signal are read off one tree.
 */
import { describe, expect, it } from 'vitest';

import { buildShowMapTree } from '../showMapTree';
import { getAttentionActions, getDirectActionsForNode } from '../showMapActions';
import { computeShowDeskPendingSignals } from '../showDeskPendingSignals';
import { buildClassChecklist } from '../cockpit/classChecklist';
import { buildSecretaryCockpitSnapshot } from '../cockpit/buildSecretaryCockpitSnapshot';
import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import type { ShowMapClassInput, ShowMapTree } from '../showMapTypes';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

const SATURDAY = '2026-10-10';
const SUNDAY = '2026-10-11';

const show = { id: 'show-1', name: 'Fall Trial', organization: 'AKC' } as Show;

function trial(id: string, trialDate: string, registryId = 'AKC'): SyncableTrial {
  return {
    id,
    showId: 'show-1',
    trialDate,
    trialNumber: id.slice(-1),
    status: 'In Progress',
    registryId,
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  } as SyncableTrial;
}

function cls(
  id: string,
  trialId: string,
  status: string,
  judge: { judgeId?: string; judgeName?: string } = {
    judgeId: 'judge-jane',
    judgeName: 'Jane Smith',
  },
  extra: Partial<ShowMapClassInput> = {}
): ShowMapClassInput {
  return { id, trialId, name: `Class ${id}`, status, ...judge, ...extra };
}

const scored = (classId: string) => ({ id: `e-${classId}`, class_id: classId, is_scored: true });

function build(input: {
  trials: SyncableTrial[];
  classes: ShowMapClassInput[];
  entries?: Array<Record<string, unknown>>;
}): ShowMapTree {
  return buildShowMapTree({
    show,
    trials: input.trials,
    classes: input.classes,
    entries: input.entries ?? input.classes.map(c => scored(c.id)),
  });
}

const wrapUp = (tree: ShowMapTree, classId: string) =>
  tree.nodesById[`class:${classId}`]?.wrapUpStatus;

const actionIds = (tree: ShowMapTree, classId: string) =>
  getDirectActionsForNode(tree.nodesById[`class:${classId}`]!, { tree }).map(a => a.id);

describe("judge's end-of-day sign-off (MYK9-1030)", () => {
  it('a complete class whose judge is still judging that day waits, neutral, with no nag', () => {
    const tree = build({
      trials: [trial('trial-1', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed'), cls('c2', 'trial-1', 'In Progress')],
      entries: [scored('c1'), { id: 'e-c2', class_id: 'c2' }],
    });

    expect(wrapUp(tree, 'c1')).toEqual({
      value: SHOW_MAP_WRAP_UP_STATUS.JUDGE_SIGN_OFF_AT_END_OF_DAY,
      label: 'Initials at end of day',
      kind: 'neutral',
    });
    expect(actionIds(tree, 'c1')).not.toContain('collect-judge-signature');
    expect(actionIds(tree, 'c1')).not.toContain('record-judge-sign-off');
    expect(getAttentionActions('root', { tree })).toEqual([]);
    const signals = computeShowDeskPendingSignals({ showId: 'show-1', tree, entries: [] });
    expect(signals.find(s => s.id === 'classes-needing-signature')).toBeUndefined();
  });

  it("asks for initials on every class of the day once the judge's last class is done", () => {
    const tree = build({
      trials: [trial('trial-1', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed'), cls('c2', 'trial-1', 'Completed')],
    });

    for (const id of ['c1', 'c2']) {
      expect(wrapUp(tree, id)).toEqual({
        value: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
        label: "Needs judge's initials",
        kind: 'attention',
      });
    }
    const signals = computeShowDeskPendingSignals({ showId: 'show-1', tree, entries: [] });
    expect(signals.find(s => s.id === 'classes-needing-signature')).toMatchObject({
      count: 2,
      label: "2 classes need judge's initials",
    });

    const record = getDirectActionsForNode(tree.nodesById['class:c1']!, { tree }).find(
      a => a.id === 'record-judge-sign-off'
    );
    expect(record).toMatchObject({
      label: 'Initialed by Jane Smith, Sat, Oct 10',
      classIds: ['c1', 'c2'],
      registryId: 'AKC',
      createsAttention: true,
    });
    const collect = getDirectActionsForNode(tree.nodesById['class:c2']!, { tree }).find(
      a => a.id === 'collect-judge-signature'
    );
    expect(collect?.href).toBe(
      '/shows/show-1/reports?report=result-catalog&trialId=trial-1&classId=c2'
    );
  });

  it('reads the registry done wording once signed, and offers only the per-class undo', () => {
    const signed = { judgeSignedOffAt: '2026-10-10T21:00:00Z' };
    const tree = build({
      trials: [trial('trial-1', SATURDAY, 'UKC')],
      classes: [
        cls('c1', 'trial-1', 'Completed', undefined, signed),
        cls('c2', 'trial-1', 'Completed', undefined, signed),
      ],
    });

    expect(wrapUp(tree, 'c1')).toEqual({
      value: SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
      label: 'Signed by judge',
      kind: 'neutral',
    });
    expect(actionIds(tree, 'c1')).toContain('clear-judge-sign-off');
    expect(actionIds(tree, 'c1')).not.toContain('record-judge-sign-off');
    expect(getAttentionActions('root', { tree }).map(a => a.id)).not.toContain(
      'collect-judge-signature'
    );
  });

  it('ignores entries.judge_signature: nothing writes it, so it cannot sign a class', () => {
    const tree = build({
      trials: [trial('trial-1', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed')],
      entries: [{ ...scored('c1'), judge_signature_timestamp: '2026-10-10T21:00:00Z' }],
    });

    expect(wrapUp(tree, 'c1')?.value).toBe(SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE);
  });

  it('keeps a class with only pulled or scratched entries at "Ready for wrap-up"', () => {
    const tree = build({
      trials: [trial('trial-1', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed'), cls('c2', 'trial-1', 'In Progress')],
      entries: [
        { id: 'e1', class_id: 'c1', entry_status: 'scratched', check_in_status: 'pulled' },
        { id: 'e2', class_id: 'c2' },
      ],
    });

    expect(wrapUp(tree, 'c1')).toEqual({
      value: SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
      label: 'Ready for wrap-up',
      kind: 'neutral',
    });
  });

  it("decides the judge's day across trials on the same date", () => {
    const tree = build({
      trials: [trial('trial-1', SATURDAY), trial('trial-2', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed'), cls('c2', 'trial-2', 'In Progress')],
      entries: [scored('c1'), { id: 'e-c2', class_id: 'c2' }],
    });

    expect(wrapUp(tree, 'c1')?.value).toBe(SHOW_MAP_WRAP_UP_STATUS.JUDGE_SIGN_OFF_AT_END_OF_DAY);
    // Trial 1 is all complete, but its class still waits on the judge: not ready to submit.
    expect(tree.nodesById['trial:trial-1']?.wrapUpStatus).toBeUndefined();

    const done = build({
      trials: [trial('trial-1', SATURDAY), trial('trial-2', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed'), cls('c2', 'trial-2', 'Completed')],
    });
    const record = getDirectActionsForNode(done.nodesById['class:c2']!, { tree: done }).find(
      a => a.id === 'record-judge-sign-off'
    );
    expect(record?.classIds).toEqual(['c1', 'c2']);
  });

  it("keeps two judges' days apart on one date", () => {
    const tree = build({
      trials: [trial('trial-1', SATURDAY)],
      classes: [
        cls('c1', 'trial-1', 'Completed'),
        cls('c2', 'trial-1', 'In Progress', { judgeId: 'judge-raj', judgeName: 'Raj Patel' }),
      ],
      entries: [scored('c1'), { id: 'e-c2', class_id: 'c2' }],
    });

    // Jane is done for the day even though Raj is still judging.
    expect(wrapUp(tree, 'c1')?.value).toBe(SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE);
    const record = getDirectActionsForNode(tree.nodesById['class:c1']!, { tree }).find(
      a => a.id === 'record-judge-sign-off'
    );
    expect(record?.classIds).toEqual(['c1']);
  });

  it("does not hold Saturday's classes for the same judge's Sunday", () => {
    const tree = build({
      trials: [trial('trial-1', SATURDAY), trial('trial-2', SUNDAY)],
      classes: [cls('c1', 'trial-1', 'Completed'), cls('c2', 'trial-2', 'Scheduled')],
      entries: [scored('c1'), { id: 'e-c2', class_id: 'c2' }],
    });

    expect(wrapUp(tree, 'c1')?.value).toBe(SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE);
  });

  it('does not wait on a cancelled class', () => {
    const tree = build({
      trials: [trial('trial-1', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed'), cls('c2', 'trial-1', 'Cancelled')],
      entries: [scored('c1')],
    });

    expect(wrapUp(tree, 'c1')?.value).toBe(SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE);
  });

  it('says "at end of day" on the checklist, and offers Undo once signed', () => {
    expect(
      buildClassChecklist({
        lifecycle: 'complete',
        entryCount: 2,
        scoredCount: 2,
        wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.JUDGE_SIGN_OFF_AT_END_OF_DAY,
        paperwork: [],
        registryId: 'AKC',
      }).find(item => item.id === 'judge-signature')
    ).toMatchObject({ state: 'todo', detail: 'Judge initials at end of day' });

    const tree = build({
      trials: [trial('trial-1', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed', undefined, { judgeSignedOffAt: '2026-10-10' })],
    });
    const snapshot = buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: [trial('trial-1', SATURDAY)],
      classes: [cls('c1', 'trial-1', 'Completed', undefined, { judgeSignedOffAt: '2026-10-10' })],
      tree,
      pendingSignals: [],
      returnTo: '/shows/show-1',
      now: new Date('2026-10-10T22:00:00Z'),
    });
    const sourceClass = snapshot.classes[0]!;
    expect(
      buildClassChecklist({ ...sourceClass, paperwork: [] }).find(
        item => item.id === 'judge-signature'
      )
    ).toMatchObject({
      state: 'done',
      command: { commandId: 'clear-judge-sign-off:class:c1', label: 'Undo initials' },
    });
  });

  describe('a class the judge will never run does not hold the day open', () => {
    const NEEDS = {
      value: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
      label: "Needs judge's initials",
      kind: 'attention',
    };
    const AT_END = SHOW_MAP_WRAP_UP_STATUS.JUDGE_SIGN_OFF_AT_END_OF_DAY;
    // The Show Desk passes counts only once the entries read produced data; null = unknown.
    const knownEmpty = { entryCount: 0, scoredCount: 0, runListCount: 0 };
    const unknown = { entryCount: null, scoredCount: null, runListCount: null };

    const expectSignOffOffered = (tree: ShowMapTree) => {
      expect(wrapUp(tree, 'c1')).toEqual(NEEDS);
      const record = getDirectActionsForNode(tree.nodesById['class:c1']!, { tree }).find(
        a => a.id === 'record-judge-sign-off'
      );
      expect(record).toMatchObject({ classIds: ['c1'] });
      expect(actionIds(tree, 'c1')).toContain('collect-judge-signature');
    };

    it('a confirmed-empty class in the same trial', () => {
      const tree = build({
        trials: [trial('trial-1', SATURDAY)],
        classes: [
          cls('c1', 'trial-1', 'Completed', undefined, {
            entryCount: 1,
            scoredCount: 1,
            runListCount: 1,
          }),
          cls('c2', 'trial-1', 'Upcoming', undefined, knownEmpty),
        ],
        entries: [scored('c1')],
      });
      expectSignOffOffered(tree);
    });

    it('a confirmed-empty class in another trial that day', () => {
      const tree = build({
        trials: [trial('trial-1', SATURDAY), trial('trial-2', SATURDAY)],
        classes: [
          cls('c1', 'trial-1', 'Completed', undefined, {
            entryCount: 1,
            scoredCount: 1,
            runListCount: 1,
          }),
          cls('c2', 'trial-2', 'Upcoming', undefined, knownEmpty),
        ],
        entries: [scored('c1')],
      });
      expectSignOffOffered(tree);
    });

    it('a class whose only entries are pulled or scratched', () => {
      const tree = build({
        trials: [trial('trial-1', SATURDAY)],
        classes: [
          cls('c1', 'trial-1', 'Completed', undefined, {
            entryCount: 1,
            scoredCount: 1,
            runListCount: 1,
          }),
          cls('c2', 'trial-1', 'Upcoming', undefined, knownEmpty),
        ],
        entries: [
          scored('c1'),
          { id: 'e-p', class_id: 'c2', check_in_status: 'pulled' },
          { id: 'e-s', class_id: 'c2', entry_status: 'scratched' },
        ],
      });
      expectSignOffOffered(tree);
    });

    it('keeps waiting when the empty class has an entry still pending acceptance', () => {
      const tree = build({
        trials: [trial('trial-1', SATURDAY)],
        classes: [
          cls('c1', 'trial-1', 'Completed', undefined, {
            entryCount: 1,
            scoredCount: 1,
            runListCount: 1,
          }),
          cls('c2', 'trial-1', 'Upcoming', undefined, {
            entryCount: 0,
            scoredCount: 0,
            runListCount: 1,
          }),
        ],
        entries: [scored('c1'), { id: 'e-pending', class_id: 'c2', entry_status: 'pending' }],
      });
      expect(wrapUp(tree, 'c1')?.value).toBe(AT_END);
    });

    it('keeps waiting when the entries read has not produced data', () => {
      const tree = build({
        trials: [trial('trial-1', SATURDAY)],
        classes: [
          cls('c1', 'trial-1', 'Completed'),
          cls('c2', 'trial-1', 'Upcoming', undefined, unknown),
        ],
        entries: [scored('c1')],
      });
      expect(wrapUp(tree, 'c1')?.value).toBe(AT_END);
      expect(actionIds(tree, 'c1')).not.toContain('record-judge-sign-off');
    });
  });
});
