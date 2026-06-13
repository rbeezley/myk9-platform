import { describe, it, expect } from 'vitest';
import { prepareResultLabelItems, type ResultLabelContext } from '../resultLabelData';
import type { ReportEntry } from '@/lib/reports/types';

function entry(over: Partial<ReportEntry>): ReportEntry {
  return {
    id: 'e',
    armband: 1,
    runOrder: 1,
    callName: 'Dog',
    breed: 'Breed',
    handler: 'Handler',
    registrationNumber: null,
    checkInStatus: null,
    section: null,
    isScored: true,
    resultText: 'Q',
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    ...over,
  };
}

const ctx: ResultLabelContext = {
  showName: 'Spring Scent Trial 2026',
  clubName: 'Twin Cities Dog Club',
  trialNumber: '1',
  classElement: 'Container',
  classLevel: 'Novice',
  classSection: 'A',
};

describe('prepareResultLabelItems', () => {
  it('maps armband, name, handler, club, and a trial/class line', () => {
    const [item] = prepareResultLabelItems(
      [entry({ id: 'e1', armband: 42, callName: 'Scout', handler: 'Jane' })],
      'placement',
      ctx
    );
    expect(item.armband).toBe(42);
    expect(item.callName).toBe('Scout');
    expect(item.handler).toBe('Jane');
    expect(item.clubName).toBe('Twin Cities Dog Club');
    expect(item.trialClassLine).toBe('Trial 1 — Container Novice A');
  });

  it('prefers per-entry class context over the fallback context', () => {
    const [item] = prepareResultLabelItems(
      [
        entry({
          id: 'e1',
          trialNumber: '2',
          classElement: 'Interior',
          classLevel: 'Advanced',
          classSection: '',
        }),
      ],
      'placement',
      ctx
    );
    expect(item.trialClassLine).toBe('Trial 2 — Interior Advanced');
  });

  it('shows a real placement but never a status-code placement (>= 9000)', () => {
    const [placed, nq] = prepareResultLabelItems(
      [
        entry({ id: 'p', armband: 1, finalPlacement: 1, isScored: true }),
        entry({ id: 'n', armband: 2, finalPlacement: 9996, isScored: true, totalFaults: 5 }),
      ],
      'armband',
      ctx
    );
    expect(placed.placement).toBe('1');
    expect(nq.placement).toBeNull();
    // The NQ entry still has a printable result (faults), so the result line shows.
    expect(nq.hasResults).toBe(true);
  });

  it('marks unscored entries as having no results', () => {
    const [item] = prepareResultLabelItems(
      [
        entry({
          isScored: false,
          finalPlacement: null,
          searchTimeSeconds: null,
          totalFaults: null,
        }),
      ],
      'placement',
      ctx
    );
    expect(item.placement).toBeNull();
    expect(item.hasResults).toBe(false);
  });

  it('formats a non-null search time and leaves null times empty', () => {
    const [timed, untimed] = prepareResultLabelItems(
      [
        entry({ id: 't', armband: 1, searchTimeSeconds: 47, isScored: true }),
        entry({ id: 'u', armband: 2, searchTimeSeconds: null, isScored: true }),
      ],
      'armband',
      ctx
    );
    expect(timed.timeStr).not.toBe('');
    expect(untimed.timeStr).toBe('');
  });

  it('omits clubName when not provided', () => {
    const [item] = prepareResultLabelItems([entry({})], 'placement', {
      showName: 'Show',
    });
    expect(item.clubName).toBeUndefined();
  });

  it('orders by armband when sortOrder is "armband"', () => {
    const items = prepareResultLabelItems(
      [
        entry({ id: 'a', armband: 30 }),
        entry({ id: 'b', armband: 10 }),
        entry({ id: 'c', armband: 20 }),
      ],
      'armband',
      ctx
    );
    expect(items.map(i => i.armband)).toEqual([10, 20, 30]);
  });
});
