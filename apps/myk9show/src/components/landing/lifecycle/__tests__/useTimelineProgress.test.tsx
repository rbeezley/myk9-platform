import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineProgress } from '../useTimelineProgress';

type Entry = Partial<IntersectionObserverEntry> & { target: Element };
type Observer = {
  cb: (e: Entry[]) => void;
  options: IntersectionObserverInit;
  unobserve: ReturnType<typeof vi.fn>;
};
let observers: Observer[] = [];

const el = (id: string) => document.getElementById(id)!;
const rect = (top: number) => ({ top }) as DOMRectReadOnly;
// A stable array: a fresh literal per render would rebuild the observers on every render.
const IDS = ['a', 'b', 'c'] as const;

describe('useTimelineProgress', () => {
  beforeEach(() => {
    document.body.innerHTML = ['a', 'b', 'c']
      .map(id => `<div id="${id}"><span id="${id}-dot"></span></div>`)
      .join('');
    observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (this: unknown, cb: Observer['cb'], options: IntersectionObserverInit) {
        const o = { cb, options, unobserve: vi.fn() };
        observers.push(o);
        return { observe: vi.fn(), unobserve: o.unobserve, disconnect: vi.fn() };
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks(); // [ADDED] the reduced-motion case spies on matchMedia
  });

  // The progress observer is the one with a negative bottom margin (top half of the viewport).
  const progress = () => observers.find(o => String(o.options.rootMargin).includes('-50%'))!;
  const reveal = () => observers.find(o => o !== progress())!;

  it('counts steps whose dot has reached the middle of the viewport', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(result.current.reached).toBe(0);
    act(() =>
      progress().cb([
        { target: el('a-dot'), isIntersecting: false, boundingClientRect: rect(-40) }, // scrolled past
        { target: el('b-dot'), isIntersecting: true, boundingClientRect: rect(200) }, // in the top half
        { target: el('c-dot'), isIntersecting: false, boundingClientRect: rect(900) }, // below the middle
      ])
    );
    expect(result.current.reached).toBe(2);
  });

  it('un-reaches a step when its dot returns below the middle', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    act(() =>
      progress().cb([
        { target: el('a-dot'), isIntersecting: true, boundingClientRect: rect(100) },
        { target: el('b-dot'), isIntersecting: true, boundingClientRect: rect(300) },
      ])
    );
    expect(result.current.reached).toBe(2);
    act(() =>
      progress().cb([{ target: el('b-dot'), isIntersecting: false, boundingClientRect: rect(700) }])
    );
    expect(result.current.reached).toBe(1);
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

  it('reveals everything and fills every step when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(result.current.reached).toBe(3);
    expect(['a', 'b', 'c'].every(result.current.isRevealed)).toBe(true);
  });

  it('reveals everything immediately under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      q =>
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
