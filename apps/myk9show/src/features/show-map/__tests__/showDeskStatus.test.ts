import { describe, expect, it } from 'vitest';
import { buildShowMapTree } from '../showMapTree';
import {
  computeShowDeskStatus,
  hasAnyWrapUpEligibleNode,
} from '../showDeskStatus';
import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';

const baseShow = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-05-15',
  endDate: '2026-05-17',
} as Show;

function makeTrial(overrides: Partial<SyncableTrial> = {}): SyncableTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    showName: 'Spring Trial',
    trialDate: '2026-05-15',
    trialNumber: '1',
    status: 'Not Started',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
    ...overrides,
  } as SyncableTrial;
}

const TRIAL_NOT_STARTED = makeTrial();

function buildTree(input: {
  show?: Show;
  trials?: SyncableTrial[];
  classes?: ShowMapClassInput[];
  entries?: Array<Record<string, unknown>>;
}) {
  return buildShowMapTree({
    show: input.show ?? baseShow,
    trials: input.trials ?? [TRIAL_NOT_STARTED],
    classes: input.classes ?? [],
    entries: input.entries ?? [],
  });
}

describe('computeShowDeskStatus', () => {
  it('returns setup when start date is in the future and no scoring activity', () => {
    const tree = buildTree({
      classes: [
        { id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Not Started' },
      ],
    });

    const result = computeShowDeskStatus({
      show: baseShow,
      trials: [TRIAL_NOT_STARTED],
      tree,
      now: new Date('2026-05-01T12:00:00'),
    });

    expect(result.status).toBe('setup');
  });

  it('returns show-in-progress when today is between start and end date', () => {
    const tree = buildTree({
      classes: [
        { id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Not Started' },
      ],
    });

    const result = computeShowDeskStatus({
      show: baseShow,
      trials: [TRIAL_NOT_STARTED],
      tree,
      now: new Date('2026-05-16T09:00:00'),
    });

    expect(result.status).toBe('show-in-progress');
  });

  it('returns show-in-progress when at least one class is active, regardless of date', () => {
    const tree = buildTree({
      classes: [
        { id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'In Progress' },
      ],
    });

    const result = computeShowDeskStatus({
      show: baseShow,
      trials: [TRIAL_NOT_STARTED],
      tree,
      now: new Date('2026-05-01T12:00:00'),
    });

    expect(result.status).toBe('show-in-progress');
  });

  it('returns wrap-up when past end date, no active classes, and wrap-up-eligible nodes exist', () => {
    const tree = buildTree({
      classes: [
        { id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Completed' },
      ],
      entries: [
        {
          id: 'e1',
          class_id: 'c1',
          dog: { call_name: 'Bella' },
          entry_status: 'accepted',
          is_scored: false,
        },
      ],
    });

    const result = computeShowDeskStatus({
      show: baseShow,
      trials: [TRIAL_NOT_STARTED],
      tree,
      now: new Date('2026-05-20T12:00:00'),
    });

    expect(result.status).toBe('wrap-up');
  });

  it('returns closed when all classes are complete and submitted to registry', () => {
    const submittedTrial = makeTrial({
      status: 'Completed',
      resultSubmittedAt: '2026-05-18T12:00:00Z',
    });
    const tree = buildTree({
      trials: [submittedTrial],
      classes: [
        { id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Completed' },
      ],
      entries: [
        {
          id: 'e1',
          class_id: 'c1',
          dog: { call_name: 'Bella' },
          entry_status: 'accepted',
          is_scored: true,
          judge_signature_at: '2026-05-17T14:00:00Z',
        },
      ],
    });

    const result = computeShowDeskStatus({
      show: baseShow,
      trials: [submittedTrial],
      tree,
      now: new Date('2026-05-20T12:00:00'),
    });

    expect(result.status).toBe('closed');
  });

  it('produces a summary that mentions class completion and attention counts', () => {
    const tree = buildTree({
      classes: [
        { id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Completed' },
        { id: 'c2', trialId: 'trial-1', name: 'Exterior Novice A', status: 'In Progress' },
      ],
      entries: [
        {
          id: 'e1',
          class_id: 'c2',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ],
    });

    const result = computeShowDeskStatus({
      show: baseShow,
      trials: [TRIAL_NOT_STARTED],
      tree,
      now: new Date('2026-05-16T09:00:00'),
    });

    expect(result.summary).toContain('1 of 2 classes complete');
    expect(result.summary).toContain('1 entry needs attention');
  });

  it('produces a fallback summary when no classes or attention exist', () => {
    const tree = buildTree({ classes: [] });

    const result = computeShowDeskStatus({
      show: baseShow,
      trials: [TRIAL_NOT_STARTED],
      tree,
      now: new Date('2026-05-01T12:00:00'),
    });

    expect(result.summary).toBe('No activity yet');
  });
});

describe('hasAnyWrapUpEligibleNode', () => {
  it('returns false for a tree with no class-level wrap-up status', () => {
    const tree = buildTree({
      classes: [
        { id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Not Started' },
      ],
    });

    expect(hasAnyWrapUpEligibleNode(tree)).toBe(false);
  });

  it('returns true when at least one class carries a wrap-up-eligible status value', () => {
    const tree = buildTree({
      classes: [
        { id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Completed' },
      ],
      entries: [
        {
          id: 'e1',
          class_id: 'c1',
          dog: { call_name: 'Bella' },
          entry_status: 'accepted',
          is_scored: false,
        },
      ],
    });

    const eligible = Object.values(tree.nodesById).some(
      node =>
        node.type === 'class' &&
        node.wrapUpStatus?.value &&
        node.wrapUpStatus.value !== SHOW_MAP_WRAP_UP_STATUS.SUBMITTED_TO_REGISTRY
    );
    expect(eligible).toBe(true);
    expect(hasAnyWrapUpEligibleNode(tree)).toBe(true);
  });
});
