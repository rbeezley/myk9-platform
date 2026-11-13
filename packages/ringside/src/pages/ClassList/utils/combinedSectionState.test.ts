import { describe, expect, it } from 'vitest';
import type { ClassEntry } from '../types';
import {
  mergeSectionCancellation,
  mergeSectionPhase,
  withMergedSectionState,
  type PhaseSource,
} from './combinedSectionState';
import { groupSectionedClasses } from './noviceClassGrouping';

const section = (fields: Partial<PhaseSource>): PhaseSource => ({
  class_status: 'in_progress',
  ...fields,
});

describe('mergeSectionPhase', () => {
  it('Briefing in both takes the earlier briefing time', () => {
    const a = section({ class_status: 'briefing', briefing_time: '10:00' });
    const b = section({ class_status: 'briefing', briefing_time: '10:30' });
    expect(mergeSectionPhase(a, b)).toEqual({ status: 'briefing', time: '10:00' });
    expect(mergeSectionPhase(b, a)).toEqual({ status: 'briefing', time: '10:00' });
  });

  it('Break in both takes the later break-until time', () => {
    const a = section({ class_status: 'break', break_until: '10:45' });
    const b = section({ class_status: 'break', break_until: '10:30' });
    expect(mergeSectionPhase(a, b)).toEqual({ status: 'break', time: '10:45' });
    expect(mergeSectionPhase(b, a)).toEqual({ status: 'break', time: '10:45' });
  });

  it('Break and Briefing mixed reads the Briefing section only', () => {
    const a = section({ class_status: 'break', break_until: '11:00' });
    const b = section({ class_status: 'briefing', briefing_time: '09:30' });
    expect(mergeSectionPhase(a, b)).toEqual({ status: 'briefing', time: '09:30' });
    expect(mergeSectionPhase(b, a)).toEqual({ status: 'briefing', time: '09:30' });
  });

  it('Offline Scoring on either section wins and carries no time', () => {
    const phase = section({ class_status: 'briefing', briefing_time: '10:00' });
    const offline = section({ class_status: 'offline-scoring' });
    expect(mergeSectionPhase(phase, offline)).toEqual({ status: 'offline-scoring' });
    expect(mergeSectionPhase(offline, phase)).toEqual({ status: 'offline-scoring' });
  });

  it('Start Time on different dates picks the earlier instant, not the earlier clock', () => {
    const late = section({
      class_status: 'start_time',
      revised_expected_start: '2026-10-31T04:00:00Z',
    });
    const nextDay = section({
      class_status: 'start_time',
      revised_expected_start: '2026-11-01T06:00:00Z',
    });
    expect(mergeSectionPhase(nextDay, late).time).toBe('2026-10-31T04:00:00Z');
    expect(mergeSectionPhase(late, nextDay).time).toBe('2026-10-31T04:00:00Z');
  });

  it('carries no time when neither section holds the merged phase', () => {
    const a = section({ class_status: 'completed' });
    const b = section({ class_status: 'setup' });
    expect(mergeSectionPhase(a, b)).toEqual({ status: 'in_progress' });
    expect(
      mergeSectionPhase(section({ class_status: 'briefing', briefing_time: '10:00' }), section({}))
    ).toEqual({ status: 'in_progress' });
  });
});

describe('withMergedSectionState phase time', () => {
  const card = (fields: Partial<ClassEntry>) => fields as ClassEntry;

  it("shows B's earlier briefing instead of A's arbitrary one", () => {
    const merged = withMergedSectionState(
      card({ class_status: 'briefing', briefing_time: '10:30' }),
      card({ class_status: 'briefing', briefing_time: '10:00' })
    );
    expect(merged.briefing_time).toBe('10:00');
  });

  it("does not keep A's phase time once the pair has moved on", () => {
    const merged = withMergedSectionState(
      card({ class_status: 'briefing', briefing_time: '10:00' }),
      card({ class_status: 'in_progress' })
    );
    expect(merged.class_status).toBe('in_progress');
    expect(merged.briefing_time).toBeUndefined();
  });

  it('takes the later break-until', () => {
    const merged = withMergedSectionState(
      card({ class_status: 'break', break_until: '10:30' }),
      card({ class_status: 'break', break_until: '10:45' })
    );
    expect(merged.break_until).toBe('10:45');
  });
});

describe('A/B cancellation (MYK9-1847)', () => {
  const sec = (section: string, is_cancelled: boolean, class_status: ClassEntry['class_status']) =>
    ({ section, is_cancelled, class_status }) as ClassEntry;

  it.each([
    ['A only', true, false, false, ['A']],
    ['B only', false, true, false, ['B']],
    ['both', true, true, true, ['A', 'B']],
    ['neither', false, false, false, []],
  ])('%s', (_name, aCancelled, bCancelled, all, sections) => {
    expect(
      mergeSectionCancellation(sec('A', aCancelled, 'setup'), sec('B', bCancelled, 'setup'))
    ).toEqual({
      allCancelled: all,
      cancelledSections: sections,
    });
  });

  it('the merged card is cancelled when both sections are', () => {
    const both = withMergedSectionState(sec('A', true, 'setup'), sec('B', true, 'setup'));
    expect(both.is_cancelled).toBe(true);
  });

  it('the merged card never takes section A cancelled flag alone', () => {
    const merged = withMergedSectionState(sec('A', true, 'setup'), sec('B', false, 'in_progress'));
    expect(merged.is_cancelled).toBeUndefined();
  });

  it('neither cancelled: no cancellation fact on the card', () => {
    const merged = withMergedSectionState(sec('A', false, 'setup'), sec('B', false, 'setup'));
    expect(merged.is_cancelled).toBeUndefined();
  });
});

describe('grouping an A/B pair by cancellation (MYK9-1847)', () => {
  const abSection = (
    id: string,
    letter: 'A' | 'B',
    is_cancelled: boolean,
    class_status: ClassEntry['class_status']
  ) =>
    ({
      id,
      section: letter,
      level: 'Novice',
      element: 'Interior',
      class_status,
      entry_count: 3,
      completed_count: letter === 'B' ? 3 : 0,
      dogs: [],
      is_favorite: false,
      ...(is_cancelled ? { is_cancelled: true } : {}),
    }) as unknown as ClassEntry;
  const pairOf = (entry: ClassEntry, all: ClassEntry[]) =>
    all.find(other => other.id !== entry.id) ?? null;
  const group = (a: ClassEntry, b: ClassEntry) =>
    groupSectionedClasses([a, b], 'AKC Scent Work', pairOf);

  it.each([
    ['A only', true, false],
    ['B only', false, true],
  ])('%s cancelled: each section keeps its own card', (_name, aCancelled, bCancelled) => {
    const cards = group(
      abSection('a', 'A', aCancelled, 'setup'),
      abSection('b', 'B', bCancelled, 'completed')
    );
    expect(cards.map(card => card.id)).toEqual(['a', 'b']);
    expect(cards.find(card => card.section === 'A & B')).toBeUndefined();
    const cancelled = cards.find(card => card.is_cancelled === true);
    expect(cancelled?.id).toBe(aCancelled ? 'a' : 'b');
    // The running section reads its own status, not a merge with the cancelled one.
    const live = cards.find(card => card.is_cancelled !== true);
    expect(live?.class_status).toBe(aCancelled ? 'completed' : 'setup');
  });

  it('both cancelled: one combined card that reads cancelled', () => {
    const cards = group(abSection('a', 'A', true, 'setup'), abSection('b', 'B', true, 'setup'));
    expect(cards).toHaveLength(1);
    expect(cards[0]?.section).toBe('A & B');
    expect(cards[0]?.is_cancelled).toBe(true);
  });

  it('neither cancelled: one combined card, not cancelled', () => {
    const cards = group(
      abSection('a', 'A', false, 'setup'),
      abSection('b', 'B', false, 'in_progress')
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.is_cancelled).toBeUndefined();
    expect(cards[0]?.entry_count).toBe(6);
  });

  it('un-cancelling a section combines the pair again', () => {
    const a = abSection('a', 'A', true, 'setup');
    const b = abSection('b', 'B', false, 'in_progress');
    expect(group(a, b)).toHaveLength(2);
    expect(group({ ...a, is_cancelled: false }, b)).toHaveLength(1);
  });
});
