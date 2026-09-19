import { describe, expect, it } from 'vitest';

import { sortReportDogOptions, type ReportDogOption } from './useReportDogOptions';

const dog = (id: string, armband: string | null): ReportDogOption => ({
  id,
  callName: id,
  registeredName: null,
  armband,
});

describe('sortReportDogOptions', () => {
  it('keeps alphanumeric labels intact and orders them beside their numeric base', () => {
    const sorted = sortReportDogOptions([dog('12B', '12B'), dog('12A', '12A'), dog('12', '12')]);

    expect(sorted.map(option => [option.id, option.armband])).toEqual([
      ['12', '12'],
      ['12A', '12A'],
      ['12B', '12B'],
    ]);
  });
});
