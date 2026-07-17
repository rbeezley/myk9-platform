import { describe, expect, it, beforeEach } from 'vitest';
import { PlacementCalculatorService } from './PlacementCalculatorService';
import type { BaseScore } from '@/types/scoring-types';
import type { ScentWorkResult, MultiAreaScentWorkResult } from '@/types/scent-work-types';

function score(
  entryId: string,
  overrides: Partial<BaseScore> & { totalFaults?: number; courseTime?: number } = {}
): BaseScore {
  const now = new Date('2026-07-01T12:00:00.000Z');
  const { totalFaults, courseTime, ...baseOverrides } = overrides;
  return {
    entryId,
    classId: 'class-1',
    judgeId: 'judge-1',
    format: 'agility',
    qualification: 'Qualified',
    timestamp: now,
    recordedBy: 'judge-1',
    recordedAt: now,
    version: 1,
    lastModified: now,
    syncStatus: 'synced',
    // Agility-specific fields consumed by isAgilityScore()/createPlacementEntry()
    totalFaults: totalFaults ?? 0,
    courseTime: courseTime ?? 0,
    jumpFaults: 0,
    refusals: 0,
    otherFaults: 0,
    ...baseOverrides,
  } as unknown as BaseScore;
}

function scentWorkResult(
  entryId: string,
  overrides: Partial<ScentWorkResult> = {}
): ScentWorkResult {
  const now = new Date('2026-07-01T12:00:00.000Z');
  return {
    entryId,
    classId: 'class-1',
    searchTime: 30000,
    maxTimeAllowed: 60000,
    qualification: 'Qualified',
    faults: 0,
    recordedBy: 'judge-1',
    recordedAt: now,
    ...overrides,
  } as ScentWorkResult;
}

describe('PlacementCalculatorService', () => {
  let service: PlacementCalculatorService;

  beforeEach(() => {
    service = new PlacementCalculatorService({ cacheResults: false });
  });

  describe('calculatePlacements', () => {
    it('returns an empty calculation when no scores qualify', async () => {
      const scores = [
        score('e1', { qualification: 'Not Qualified' }),
        score('e2', { qualification: 'Excused' }),
      ];
      const result = await service.calculatePlacements('class-1', 'agility', scores);

      expect(result.placements).toHaveLength(0);
      expect(result.classId).toBe('class-1');
      expect(result.format).toBe('agility');
    });

    it('filters out non-qualified scores and only ranks qualified ones', async () => {
      const scores = [
        score('e1', { qualification: 'Qualified', totalFaults: 0, courseTime: 40 }),
        score('e2', { qualification: 'Not Qualified', totalFaults: 0, courseTime: 10 }),
        score('e3', { qualification: 'Qualified', totalFaults: 2, courseTime: 20 }),
      ];

      const result = await service.calculatePlacements('class-1', 'agility', scores);
      const entryIds = result.placements.map(p => p.entryId);

      expect(entryIds).toContain('e1');
      expect(entryIds).toContain('e3');
      expect(entryIds).not.toContain('e2');
    });

    it('ranks agility entries by faults first, then time (fewest faults wins)', async () => {
      const scores = [
        score('fast-but-faulted', { qualification: 'Qualified', totalFaults: 2, courseTime: 10 }),
        score('slow-clean', { qualification: 'Qualified', totalFaults: 0, courseTime: 40 }),
      ];

      const result = await service.calculatePlacements('class-1', 'agility', scores);
      const first = result.placements.find(p => p.placement === 1);

      expect(first?.entryId).toBe('slow-clean');
    });

    it('breaks ties on faults by fastest time', async () => {
      const scores = [
        score('slower', { qualification: 'Qualified', totalFaults: 0, courseTime: 40 }),
        score('faster', { qualification: 'Qualified', totalFaults: 0, courseTime: 20 }),
      ];

      const result = await service.calculatePlacements('class-1', 'agility', scores);
      const first = result.placements.find(p => p.placement === 1);

      expect(first?.entryId).toBe('faster');
    });

    it('throws for an unsupported format', async () => {
      await expect(
        service.calculatePlacements('class-1', 'not_a_format' as BaseScore['format'], [])
      ).rejects.toThrow('Unsupported format');
    });

    it('records the calculation in class history', async () => {
      const scores = [score('e1', { qualification: 'Qualified', totalFaults: 0, courseTime: 10 })];
      await service.calculatePlacements('class-1', 'agility', scores);

      const history = service.getPlacementHistory('class-1');
      expect(history).toHaveLength(1);
      expect(history[0].placements).toHaveLength(1);
    });
  });

  describe('calculateScentWorkPlacements', () => {
    it('returns empty calculation when no results qualify', async () => {
      const results = [scentWorkResult('e1', { qualification: 'Not Qualified' })];
      const calc = await service.calculateScentWorkPlacements('class-1', results);

      expect(calc.placements).toHaveLength(0);
      expect(calc.format).toBe('scent_work');
    });

    it('ranks by search time first, faults as secondary tiebreaker', async () => {
      const results = [
        scentWorkResult('slow-clean', { searchTime: 45000, faults: 0 }),
        scentWorkResult('fast-with-fault', { searchTime: 20000, faults: 1 }),
      ];

      const calc = await service.calculateScentWorkPlacements('class-1', results);
      const first = calc.placements.find(p => p.placement === 1);

      expect(first?.entryId).toBe('fast-with-fault');
    });

    it('supports multi-area results using totalSearchTime and totalFaults', async () => {
      const multiArea: MultiAreaScentWorkResult = {
        entryId: 'multi-1',
        classId: 'class-1',
        areaResults: [],
        totalSearchTime: 50000,
        qualification: 'Qualified',
        totalFaults: 1,
        recordedBy: 'judge-1',
        recordedAt: new Date('2026-07-01T12:00:00.000Z'),
      };
      const single = scentWorkResult('single-1', { searchTime: 10000, faults: 0 });

      const calc = await service.calculateScentWorkPlacements('class-1', [multiArea, single]);
      const first = calc.placements.find(p => p.placement === 1);

      expect(first?.entryId).toBe('single-1');
      expect(calc.placements).toHaveLength(2);
    });

    it('populates dog/handler metadata from the entryMetadata map with fallbacks', async () => {
      const results = [scentWorkResult('e1'), scentWorkResult('e2')];
      const metadata = new Map([['e1', { dogName: 'Rex', handlerName: 'Alice', armband: '101' }]]);

      const calc = await service.calculateScentWorkPlacements('class-1', results, metadata);
      const e1 = calc.placements.find(p => p.entryId === 'e1');
      const e2 = calc.placements.find(p => p.entryId === 'e2');

      expect(e1?.dogName).toBe('Rex');
      expect(e1?.armband).toBe('101');
      expect(e2?.dogName).toBe('Unknown Dog');
      expect(e2?.armband).toBe('000');
    });
  });

  describe('cache and history management', () => {
    it('getCachedPlacements returns null when nothing is cached', () => {
      expect(service.getCachedPlacements('unknown-class')).toBeNull();
    });

    it('getPlacementHistory returns an empty array for a class with no history', () => {
      expect(service.getPlacementHistory('unknown-class')).toEqual([]);
    });

    it('clearClassCache removes cache and history entries for that class', async () => {
      const scores = [score('e1', { qualification: 'Qualified', totalFaults: 0, courseTime: 10 })];
      await service.calculatePlacements('class-1', 'agility', scores);

      expect(service.getPlacementHistory('class-1')).toHaveLength(1);

      await service.clearClassCache('class-1');

      expect(service.getPlacementHistory('class-1')).toEqual([]);
      expect(service.getCachedPlacements('class-1')).toBeNull();
    });

    it('getStatistics reflects history entry counts across classes', async () => {
      await service.calculatePlacements('class-1', 'agility', [
        score('e1', { qualification: 'Qualified', totalFaults: 0, courseTime: 10 }),
      ]);
      await service.calculatePlacements('class-2', 'agility', [
        score('e2', { qualification: 'Qualified', totalFaults: 0, courseTime: 10 }),
      ]);

      const stats = service.getStatistics();
      expect(stats.totalHistoryEntries).toBe(2);
      expect(stats.lastCalculationTime).toBeInstanceOf(Date);
    });
  });
});
