import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useClassAvailability } from '../useClassAvailability';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// classes: .select().eq().order()
function makeClassQuery(data: unknown[] | null, error: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  return { select };
}

// shows: .select().eq('id', ...).single()
function makeShowQuery(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  return { select };
}

// entries: .select().in('class_id', ...).in('entry_status', ...)
function makeEntryQuery(data: unknown[]) {
  const inStatus = vi.fn().mockResolvedValue({ data, error: null });
  const inClass = vi.fn().mockReturnValue({ in: inStatus });
  const select = vi.fn().mockReturnValue({ in: inClass });
  return { select };
}

// waitlist_entries: .select().in('class_id', ...).eq('status', ...)
function makeWaitlistQuery(data: unknown[]) {
  const eq = vi.fn().mockResolvedValue({ data, error: null });
  const inClass = vi.fn().mockReturnValue({ eq });
  const select = vi.fn().mockReturnValue({ in: inClass });
  return { select };
}

// judge_assignments: .select().eq('show_id', ...).eq('status', ...)
function makeJudgeQuery(data: unknown[]) {
  const eq2 = vi.fn().mockResolvedValue({ data, error: null });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  return { select };
}

const CLASS_DATA = [
  {
    id: 'c1',
    name: 'Novice A',
    level: 'Novice',
    max_entries: null,
    trial_id: 't1',
    trials: { id: 't1', name: 'Trial 1', date: '2026-05-01', show_id: 'show-1' },
  },
];

describe('useClassAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty state when showId is undefined', () => {
    const { result } = renderHook(() => useClassAvailability(undefined));
    expect(result.current.classes).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('marks class as available when judge-day is under capacity', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'classes') return makeClassQuery(CLASS_DATA);
      if (table === 'shows')
        return makeShowQuery({
          default_judge_day_capacity: 125,
          mail_in_strategy: 'none',
          mail_in_value: null,
        });
      if (table === 'entries') return makeEntryQuery([{ class_id: 'c1' }, { class_id: 'c1' }]);
      if (table === 'waitlist_entries') return makeWaitlistQuery([]);
      if (table === 'judge_assignments')
        return makeJudgeQuery([
          { class_id: 'c1', person_id: 'judge-1', trials: { date: '2026-05-01' } },
        ]);
      return makeClassQuery([]);
    });

    const { result } = renderHook(() => useClassAvailability('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const cls = result.current.classes[0]!;
    expect(cls.currentEntries).toBe(2);
    expect(cls.judgeDayFull).toBe(false);
    expect(cls.judgeDayAvailable).toBe(123); // 125 - 2
    expect(cls.isFull).toBe(false);
  });

  it('marks class as full when judge-day capacity is exhausted', async () => {
    const entries = Array.from({ length: 125 }, () => ({ class_id: 'c1' }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'classes') return makeClassQuery(CLASS_DATA);
      if (table === 'shows')
        return makeShowQuery({
          default_judge_day_capacity: 125,
          mail_in_strategy: 'none',
          mail_in_value: null,
        });
      if (table === 'entries') return makeEntryQuery(entries);
      if (table === 'waitlist_entries') return makeWaitlistQuery([{ class_id: 'c1' }]);
      if (table === 'judge_assignments')
        return makeJudgeQuery([
          { class_id: 'c1', person_id: 'judge-1', trials: { date: '2026-05-01' } },
        ]);
      return makeClassQuery([]);
    });

    const { result } = renderHook(() => useClassAvailability('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const cls = result.current.classes[0]!;
    expect(cls.judgeDayFull).toBe(true);
    expect(cls.isFull).toBe(true);
    expect(cls.hasWaitlist).toBe(true);
    expect(cls.spotsAvailable).toBe(0);
  });

  it('accounts for mail-in reserved spots (fixed strategy)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'classes') return makeClassQuery(CLASS_DATA);
      if (table === 'shows')
        return makeShowQuery({
          default_judge_day_capacity: 125,
          mail_in_strategy: 'fixed',
          mail_in_value: 20,
        });
      if (table === 'entries') return makeEntryQuery([]);
      if (table === 'waitlist_entries') return makeWaitlistQuery([]);
      if (table === 'judge_assignments')
        return makeJudgeQuery([
          { class_id: 'c1', person_id: 'judge-1', trials: { date: '2026-05-01' } },
        ]);
      return makeClassQuery([]);
    });

    const { result } = renderHook(() => useClassAvailability('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const cls = result.current.classes[0]!;
    expect(cls.judgeDayAvailable).toBe(105); // 125 - 0 - 20
    expect(cls.isFull).toBe(false);
  });

  it('returns empty classes when show has no classes', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'classes') return makeClassQuery([]);
      return makeClassQuery([]);
    });

    const { result } = renderHook(() => useClassAvailability('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.classes).toEqual([]);
    expect(result.current.fullClasses).toBe(0);
    expect(result.current.totalSpotsAvailable).toBe(0);
  });

  it('sets error when class fetch fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'classes') return makeClassQuery(null, { message: 'network error' });
      return makeClassQuery([]);
    });

    const { result } = renderHook(() => useClassAvailability('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('network error');
  });

  it('entry_status filter includes in-ring alongside competing', async () => {
    // Regression: entries with entry_status='in-ring' (written by myK9Q) must be
    // counted as active so class capacity is calculated correctly.
    const inStatusSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const inClassSpy = vi.fn().mockReturnValue({ in: inStatusSpy });
    const selectSpy = vi.fn().mockReturnValue({ in: inClassSpy });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'classes') return makeClassQuery(CLASS_DATA);
      if (table === 'shows')
        return makeShowQuery({
          default_judge_day_capacity: 125,
          mail_in_strategy: 'none',
          mail_in_value: null,
        });
      if (table === 'entries') return { select: selectSpy };
      if (table === 'waitlist_entries') return makeWaitlistQuery([]);
      if (table === 'judge_assignments')
        return makeJudgeQuery([
          { class_id: 'c1', person_id: 'judge-1', trials: { date: '2026-05-01' } },
        ]);
      return makeClassQuery([]);
    });

    const { result } = renderHook(() => useClassAvailability('show-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(inStatusSpy).toHaveBeenCalledWith(
      'entry_status',
      expect.arrayContaining(['in-ring', 'competing'])
    );
  });
});
