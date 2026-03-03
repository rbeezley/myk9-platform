import { describe, it, expect } from 'vitest';
import {
  computePerformanceStats,
  normalizeExhibitorResult,
  normalizeManualResult,
} from '../performanceStatsEngine';
import type { ExhibitorResult } from '@/hooks/queries/useExhibitorResults';
import type { ManualResult } from '@/types/manual-result-types';

const makePlatformResult = (overrides: Partial<ExhibitorResult> = {}): ExhibitorResult => ({
  id: 'p1',
  dogId: 'dog1',
  dogName: 'Bella',
  dogCallName: 'Bella',
  showId: 'show1',
  classId: 'class1',
  className: 'Container Novice',
  classLevel: 'Novice',
  classElement: 'Container',
  resultText: 'Q',
  resultStatus: 'qualified',
  searchTimeSeconds: 30.5,
  totalFaults: 0,
  finalPlacement: 1,
  scoringCompletedAt: '2024-06-15T10:00:00Z',
  showName: 'Fun Trial',
  showDate: '2024-06-15',
  ...overrides,
});

const makeManualResult = (overrides: Partial<ManualResult> = {}): ManualResult => ({
  id: 'm1',
  dog_id: 'dog1',
  owner_id: 'owner1',
  organization: 'AKC',
  sport_template_id: null,
  show_name: 'Regional Trial',
  trial_date: '2024-05-10',
  judge: 'Jane Smith',
  location: null,
  element: 'Buried',
  level: 'Novice',
  section: null,
  result_status: 'qualified',
  search_time_seconds: 45.2,
  placement: 2,
  points_earned: 10,
  notes: null,
  source: 'manual',
  created_at: '2024-05-10T00:00:00Z',
  updated_at: '2024-05-10T00:00:00Z',
  ...overrides,
});

describe('performanceStatsEngine', () => {
  describe('normalizeExhibitorResult', () => {
    it('maps platform result fields correctly', () => {
      const result = normalizeExhibitorResult(makePlatformResult());
      expect(result.source).toBe('platform');
      expect(result.status).toBe('qualified');
      expect(result.element).toBe('Container');
      expect(result.level).toBe('Novice');
      expect(result.searchTimeSeconds).toBe(30.5);
    });
  });

  describe('normalizeManualResult', () => {
    it('maps manual result fields correctly', () => {
      const result = normalizeManualResult(makeManualResult());
      expect(result.source).toBe('manual');
      expect(result.status).toBe('qualified');
      expect(result.judge).toBe('Jane Smith');
      expect(result.searchTimeSeconds).toBe(45.2);
    });
  });

  describe('computePerformanceStats', () => {
    it('returns empty stats for no data', () => {
      const stats = computePerformanceStats([], []);
      expect(stats.overall.total).toBe(0);
      expect(stats.overall.qRate).toBe(0);
      expect(stats.byElement).toHaveLength(0);
      expect(stats.byLevel).toHaveLength(0);
      expect(stats.byJudge).toHaveLength(0);
      expect(stats.timeline).toHaveLength(0);
      expect(stats.summary.totalCompetitions).toBe(0);
      expect(stats.summary.fastestTime).toBeNull();
      expect(stats.summary.avgTime).toBeNull();
    });

    it('computes correct stats for all qualified results', () => {
      const stats = computePerformanceStats(
        [makePlatformResult({ id: 'p1', searchTimeSeconds: 20 })],
        [makeManualResult({ id: 'm1', search_time_seconds: 30 })]
      );
      expect(stats.overall.total).toBe(2);
      expect(stats.overall.qualified).toBe(2);
      expect(stats.overall.qRate).toBe(100);
      expect(stats.summary.totalCompetitions).toBe(2);
      expect(stats.summary.fastestTime?.seconds).toBe(20);
      expect(stats.summary.avgTime).toBe(25);
    });

    it('computes correct stats for all NQ results', () => {
      const stats = computePerformanceStats(
        [makePlatformResult({ resultStatus: 'nq', searchTimeSeconds: null })],
        [makeManualResult({ result_status: 'nq', search_time_seconds: null })]
      );
      expect(stats.overall.total).toBe(2);
      expect(stats.overall.nq).toBe(2);
      expect(stats.overall.qRate).toBe(0);
      expect(stats.summary.fastestTime).toBeNull();
      expect(stats.summary.avgTime).toBeNull();
    });

    it('computes mixed status breakdown', () => {
      const stats = computePerformanceStats(
        [
          makePlatformResult({ id: 'p1' }),
          makePlatformResult({ id: 'p2', resultStatus: 'nq', searchTimeSeconds: null }),
          makePlatformResult({ id: 'p3', resultStatus: 'absent', searchTimeSeconds: null }),
        ],
        [
          makeManualResult({ id: 'm1' }),
          makeManualResult({ id: 'm2', result_status: 'excused', search_time_seconds: null }),
        ]
      );
      expect(stats.overall.total).toBe(5);
      expect(stats.overall.qualified).toBe(2);
      expect(stats.overall.nq).toBe(1);
      expect(stats.overall.absent).toBe(1);
      expect(stats.overall.excused).toBe(1);
      expect(stats.overall.qRate).toBe(40);
    });

    it('groups by element correctly', () => {
      const stats = computePerformanceStats(
        [
          makePlatformResult({ id: 'p1', classElement: 'Container' }),
          makePlatformResult({ id: 'p2', classElement: 'Interior' }),
          makePlatformResult({ id: 'p3', classElement: 'Container' }),
        ],
        []
      );
      expect(stats.byElement).toHaveLength(2);
      const container = stats.byElement.find(e => e.element === 'Container');
      expect(container?.breakdown.total).toBe(2);
    });

    it('groups by level correctly', () => {
      const stats = computePerformanceStats(
        [
          makePlatformResult({ id: 'p1', classLevel: 'Novice' }),
          makePlatformResult({ id: 'p2', classLevel: 'Advanced' }),
        ],
        []
      );
      expect(stats.byLevel).toHaveLength(2);
    });

    it('groups by judge from manual results', () => {
      const stats = computePerformanceStats(
        [],
        [
          makeManualResult({ id: 'm1', judge: 'Judge A' }),
          makeManualResult({ id: 'm2', judge: 'Judge A' }),
          makeManualResult({ id: 'm3', judge: 'Judge B' }),
        ]
      );
      expect(stats.byJudge).toHaveLength(2);
      const judgeA = stats.byJudge.find(j => j.judge === 'Judge A');
      expect(judgeA?.breakdown.total).toBe(2);
    });

    it('computes timeline with cumulative qualifying legs', () => {
      const stats = computePerformanceStats(
        [
          makePlatformResult({ id: 'p1', showDate: '2024-01-01' }),
          makePlatformResult({
            id: 'p2',
            showDate: '2024-02-01',
            resultStatus: 'nq',
            searchTimeSeconds: null,
          }),
          makePlatformResult({ id: 'p3', showDate: '2024-03-01' }),
        ],
        []
      );
      expect(stats.timeline).toHaveLength(3);
      expect(stats.timeline[0].cumulativeQLegs).toBe(1);
      expect(stats.timeline[1].cumulativeQLegs).toBe(1); // NQ, no increment
      expect(stats.timeline[2].cumulativeQLegs).toBe(2);
    });

    it('handles results with missing search times', () => {
      const stats = computePerformanceStats(
        [
          makePlatformResult({ id: 'p1', searchTimeSeconds: null }),
          makePlatformResult({ id: 'p2', searchTimeSeconds: 25 }),
        ],
        []
      );
      expect(stats.summary.fastestTime?.seconds).toBe(25);
      expect(stats.summary.avgTime).toBe(25); // Only one qualified result with time
    });

    it('handles single result', () => {
      const stats = computePerformanceStats([makePlatformResult()], []);
      expect(stats.overall.total).toBe(1);
      expect(stats.summary.totalCompetitions).toBe(1);
      expect(stats.summary.firstDate).toBe('2024-06-15');
      expect(stats.summary.latestDate).toBe('2024-06-15');
    });

    it('computes first and latest dates across mixed sources', () => {
      const stats = computePerformanceStats(
        [makePlatformResult({ showDate: '2024-06-15' })],
        [makeManualResult({ trial_date: '2024-01-10' })]
      );
      expect(stats.summary.firstDate).toBe('2024-01-10');
      expect(stats.summary.latestDate).toBe('2024-06-15');
    });
  });
});
