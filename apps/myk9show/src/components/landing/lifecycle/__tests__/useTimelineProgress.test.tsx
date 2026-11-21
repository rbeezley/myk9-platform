import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineProgress } from '../useTimelineProgress';

type Entry = Partial<IntersectionObserverEntry> & { target: Element };
type Observer = { cb: (e: Entry[]) => void; unobserve: ReturnType<typeof vi.fn> };
let observers: Observer[] = [];

const el = (id: string) => document.getElementById(id)!;
// A stable array: a fresh literal per render would rebuild the observers on every render.
const IDS = ['a', 'b', 'c'] as const;

describe('useTimelineProgress', () => {
  beforeEach(() => {
    document.body.innerHTML = ['a', 'b', 'c'].map(id => `<div id="${id}"></div>`).join('');
    observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (this: unknown, cb: Observer['cb']) {
        const o = { cb, unobserve: vi.fn() };
        observers.push(o);
        return { observe: vi.fn(), unobserve: o.unobserve, disconnect: vi.fn() };
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const reveal = () => observers[0]!;

  it('reports no scroll progress: the reveal is all it offers', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(Object.keys(result.current)).toEqual(['isRevealed']);
  });

  it('reveals a step once and stops watching it', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(result.current.isRevealed('a')).toBe(false);
    act(() => reveal().cb([{ target: el('a'), isIntersecting: true, intersectionRatio: 0.1 }]));
    expect(result.current.isRevealed('a')).toBe(true);
    expect(reveal().unobserve).toHaveBeenCalledWith(el('a'));
    act(() => reveal().cb([{ target: el('a'), isIntersecting: false, intersectionRatio: 0 }]));
    expect(result.current.isRevealed('a')).toBe(true);
  });

  it('reveals everything when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(['a', 'b', 'c'].every(result.current.isRevealed)).toBe(true);
  });

  it('reveals everything immediately under reduced motion', () => {
    // stubGlobal, not spyOn: the global setup's matchMedia is already a vi.fn, so a spy would
    // return that same mock and its reduced-motion answer would outlive this test.
    vi.stubGlobal(
      'matchMedia',
      (q: string) =>
        ({
          matches: q.includes('reduce'),
          media: q,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList
    );
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(['a', 'b', 'c'].every(result.current.isRevealed)).toBe(true);
  });
});
