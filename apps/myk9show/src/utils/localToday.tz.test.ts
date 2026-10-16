import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateMailInReserved } from './waitlistCapacity';
import { addClassesFromTemplateHelper } from '@/hooks/classStoreCompatHelpers';
import { useClassStore } from '@/store/classStore';
import { calculateTrainingStatistics } from '@/services/mappers/trainingMappers';
import type { ClassInput, SyncableClassData } from '@/store/classStore';
import type { GeneratedClass } from '@/types/class-template-types';
import type { TrainingJournalEntry } from '@/types/training';

// 2026-11-09 19:00 in Chicago (CST) is already 2026-11-10 in UTC.
describe('client "today" is the local calendar day, not the UTC date', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  const generated = [
    { className: 'A', classNumber: 1, element: 'Container' },
  ] as unknown as GeneratedClass[];

  it('waitlist release does not fire the evening before the release date', () => {
    const base = { capacity: 100, strategy: 'fixed', value: 20, autoRelease: true };
    expect(calculateMailInReserved({ ...base, releaseDate: '2026-11-10' })).toBe(20);
    expect(calculateMailInReserved({ ...base, releaseDate: '2026-11-09' })).toBe(0);
  });

  it('template classes written by the compat helper carry the local day', async () => {
    const seen: ClassInput[] = [];
    await addClassesFromTemplateHelper('t1', generated, async c => {
      seen.push(c);
      return c as unknown as SyncableClassData;
    });
    expect(seen[0]?.trialDate).toBe('2026-11-09');
  });

  it('template classes written by the store carry the local day', () => {
    const [created] = useClassStore
      .getState()
      .addClassesFromTemplate('t1', generated) as unknown as SyncableClassData[];
    expect(created?.trialDate).toBe('2026-11-09');
  });

  it('a training streak counts a session logged yesterday (local)', () => {
    const entry = {
      id: '1',
      date: '2026-11-08',
      duration_minutes: 10,
      sport_tag: null,
    } as unknown as TrainingJournalEntry;
    expect(calculateTrainingStatistics([entry]).streak_days).toBe(1);
  });
});
