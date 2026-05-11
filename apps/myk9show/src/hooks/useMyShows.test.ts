import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { addDays, format, subDays } from 'date-fns';
import { useMyShows } from './useMyShows';
import { showFactory } from '@/test/utils/factories';
import type { Show } from '@/types/show-types';

const makeShow = (overrides: Partial<Show> = {}) => showFactory.build(overrides);
const toDateOnly = (date: Date) => format(date, 'yyyy-MM-dd');

const TODAY = toDateOnly(new Date());
const FUTURE_14 = toDateOnly(addDays(new Date(), 14));
const FUTURE_30 = toDateOnly(addDays(new Date(), 30));
const FUTURE_7 = toDateOnly(addDays(new Date(), 7));
const PAST_30 = toDateOnly(subDays(new Date(), 30));

describe('useMyShows', () => {
  it('returns empty buckets for empty input', () => {
    const { result } = renderHook(() => useMyShows([]));
    expect(result.current.today).toHaveLength(0);
    expect(result.current.upcoming).toHaveLength(0);
    expect(result.current.draft).toHaveLength(0);
    expect(result.current.past).toHaveLength(0);
    expect(result.current.attentionNeeded).toHaveLength(0);
  });

  it('places a show starting today in the today bucket', () => {
    const show = makeShow({ id: 's1', startDate: TODAY, status: 'in_progress' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.today).toHaveLength(1);
    expect(result.current.today[0].id).toBe('s1');
    expect(result.current.upcoming).toHaveLength(0);
  });

  it('places a published future show in the upcoming bucket', () => {
    const show = makeShow({ id: 's2', startDate: FUTURE_30, status: 'published' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.upcoming).toHaveLength(1);
    expect(result.current.upcoming[0].id).toBe('s2');
  });

  it('places an upcoming-status show (entries closed) in the upcoming bucket', () => {
    const show = makeShow({ id: 's3', startDate: FUTURE_14, status: 'upcoming' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.upcoming).toHaveLength(1);
    expect(result.current.upcoming[0].id).toBe('s3');
  });

  it('places a draft show in the draft bucket', () => {
    const show = makeShow({ id: 's4', startDate: FUTURE_30, status: 'draft' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.draft).toHaveLength(1);
    expect(result.current.draft[0].id).toBe('s4');
  });

  it('places a completed show in the past bucket', () => {
    const show = makeShow({ id: 's5', startDate: PAST_30, status: 'completed' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.past).toHaveLength(1);
    expect(result.current.past[0].id).toBe('s5');
  });

  it('places a cancelled show in the past bucket', () => {
    const show = makeShow({ id: 's6', startDate: PAST_30, status: 'cancelled' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.past).toHaveLength(1);
  });

  it('falls back to past bucket for shows with past start date regardless of status', () => {
    const show = makeShow({ id: 's7', startDate: PAST_30, status: 'published' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.past).toHaveLength(1);
  });

  it('partitions a mixed set of shows correctly', () => {
    const shows = [
      makeShow({ id: 'today', startDate: TODAY, status: 'in_progress' }),
      makeShow({ id: 'pub', startDate: FUTURE_30, status: 'published' }),
      makeShow({ id: 'draft', startDate: FUTURE_30, status: 'draft' }),
      makeShow({ id: 'done', startDate: PAST_30, status: 'completed' }),
    ];
    const { result } = renderHook(() => useMyShows(shows));
    expect(result.current.today.map(s => s.id)).toEqual(['today']);
    expect(result.current.upcoming.map(s => s.id)).toEqual(['pub']);
    expect(result.current.draft.map(s => s.id)).toEqual(['draft']);
    expect(result.current.past.map(s => s.id)).toEqual(['done']);
  });

  it('sorts upcoming shows ascending by startDate', () => {
    const shows = [
      makeShow({ id: 'far', startDate: FUTURE_30, status: 'published' }),
      makeShow({ id: 'near', startDate: FUTURE_14, status: 'published' }),
    ];
    const { result } = renderHook(() => useMyShows(shows));
    expect(result.current.upcoming.map(s => s.id)).toEqual(['near', 'far']);
  });

  it('sorts past shows descending by startDate', () => {
    const PAST_7 = toDateOnly(subDays(new Date(), 7));
    const shows = [
      makeShow({ id: 'older', startDate: PAST_30, status: 'completed' }),
      makeShow({ id: 'recent', startDate: PAST_7, status: 'completed' }),
    ];
    const { result } = renderHook(() => useMyShows(shows));
    expect(result.current.past.map(s => s.id)).toEqual(['recent', 'older']);
  });

  // Attention strip tests
  it('generates an urgent attention item for a today show', () => {
    const show = makeShow({ id: 'live', startDate: TODAY, status: 'in_progress' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.attentionNeeded).toHaveLength(1);
    expect(result.current.attentionNeeded[0].kind).toBe('urgent');
    expect(result.current.attentionNeeded[0].showId).toBe('live');
  });

  it('generates an info attention item for a draft show', () => {
    const show = makeShow({ id: 'dr', startDate: FUTURE_30, status: 'draft' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.attentionNeeded).toHaveLength(1);
    expect(result.current.attentionNeeded[0].kind).toBe('info');
    expect(result.current.attentionNeeded[0].showId).toBe('dr');
  });

  it('generates an urgent attention item when entry close date is within 7 days', () => {
    const show = makeShow({
      id: 'closing',
      startDate: FUTURE_30,
      status: 'published',
      entryCloseDate: FUTURE_7,
    });
    const { result } = renderHook(() => useMyShows([show]));
    const item = result.current.attentionNeeded.find(i => i.showId === 'closing');
    expect(item).toBeDefined();
    expect(item?.kind).toBe('urgent');
    expect(item?.text).toMatch(/entries close in \d+ day/i);
  });

  it('generates an info attention item when entry close date is within 8–14 days', () => {
    const FUTURE_10 = toDateOnly(addDays(new Date(), 10));
    const show = makeShow({
      id: 'soon',
      startDate: FUTURE_30,
      status: 'published',
      entryCloseDate: FUTURE_10,
    });
    const { result } = renderHook(() => useMyShows([show]));
    const item = result.current.attentionNeeded.find(i => i.showId === 'soon');
    expect(item).toBeDefined();
    expect(item?.kind).toBe('info');
  });

  it('generates an urgent attention item when entry close date is today (0 days)', () => {
    const show = makeShow({
      id: 'closing-today',
      startDate: FUTURE_30,
      status: 'published',
      entryCloseDate: TODAY,
    });
    const { result } = renderHook(() => useMyShows([show]));
    const item = result.current.attentionNeeded.find(i => i.showId === 'closing-today');
    expect(item).toBeDefined();
    expect(item?.kind).toBe('urgent');
    expect(item?.text).toMatch(/entries close in 0 days/i);
  });

  it('omits attention item when entry close date is > 14 days away', () => {
    const FUTURE_20 = toDateOnly(addDays(new Date(), 20));
    const show = makeShow({
      id: 'fine',
      startDate: FUTURE_30,
      status: 'published',
      entryCloseDate: FUTURE_20,
    });
    const { result } = renderHook(() => useMyShows([show]));
    const item = result.current.attentionNeeded.find(i => i.showId === 'fine');
    expect(item).toBeUndefined();
  });

  it('sorts urgent attention items before info items', () => {
    const shows = [
      makeShow({ id: 'draft', startDate: FUTURE_30, status: 'draft' }),
      makeShow({ id: 'live', startDate: TODAY, status: 'in_progress' }),
    ];
    const { result } = renderHook(() => useMyShows(shows));
    const items = result.current.attentionNeeded;
    expect(items[0].kind).toBe('urgent');
    expect(items[1].kind).toBe('info');
  });

  it('attention href points to the show detail route', () => {
    const show = makeShow({ id: 'x', startDate: TODAY, status: 'in_progress' });
    const { result } = renderHook(() => useMyShows([show]));
    expect(result.current.attentionNeeded[0].href).toBe('/shows/x');
  });
});
