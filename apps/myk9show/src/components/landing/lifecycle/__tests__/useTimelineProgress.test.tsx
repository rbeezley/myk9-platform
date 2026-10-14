import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineProgress } from '../useTimelineProgress';

type Entry = Partial<IntersectionObserverEntry> & { target: Element };
type Observer = { cb: (e: Entry[]) => void; unobserve: ReturnType<typeof vi.fn> };
let observers: Observer[] = [];
let frames: FrameRequestCallback[] = [];
let tops: Record<string, number> = {};

const el = (id: string) => document.getElementById(id)!;
// A stable array: a fresh literal per render would rebuild the observers on every render.
const IDS = ['a', 'b', 'c'] as const;

// Scroll to a position by placing each dot, then let the scheduled animation frame run.
const scrollTo = (positions: Record<string, number>) =>
  act(() => {
    tops = positions;
    window.dispatchEvent(new Event('scroll'));
    const pending = frames;
    frames = [];
    pending.forEach(f => f(0));
  });

describe('useTimelineProgress', () => {
  beforeEach(() => {
    document.body.innerHTML = ['a', 'b', 'c']
      .map(id => `<div id="${id}"><span id="${id}-dot"></span></div>`)
      .join('');
    observers = [];
    frames = [];
    tops = { 'a-dot': 900, 'b-dot': 1400, 'c-dot': 1900 };
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return { top: tops[this.id] ?? 0 } as DOMRect;
    });
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

  it('counts steps whose dot is at or above the middle of the viewport', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    scrollTo({ 'a-dot': 400, 'b-dot': 400.0, 'c-dot': 401 }); // middle is 400
    expect(result.current.reached).toBe(2);
  });

  it('measures once on mount, before any scroll', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(result.current.reached).toBe(0);
    act(() => {
      tops = { 'a-dot': -50, 'b-dot': 100, 'c-dot': 700 };
      frames.splice(0).forEach(f => f(0));
    });
    expect(result.current.reached).toBe(2);
  });

  it('un-reaches a step when its dot returns below the middle', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    scrollTo({ 'a-dot': 100, 'b-dot': 300, 'c-dot': 900 });
    expect(result.current.reached).toBe(2);
    scrollTo({ 'a-dot': 300, 'b-dot': 700, 'c-dot': 1300 });
    expect(result.current.reached).toBe(1);
  });

  it('counts every dot passed by a jump that never showed them', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    scrollTo({ 'a-dot': -3000, 'b-dot': -2000, 'c-dot': 200 });
    expect(result.current.reached).toBe(3);
    scrollTo({ 'a-dot': 900, 'b-dot': 1400, 'c-dot': 1900 });
    expect(result.current.reached).toBe(0);
  });

  it('counts from the top: a reached dot below an unreached one does not count', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    scrollTo({ 'a-dot': 100, 'b-dot': 900, 'c-dot': 200 });
    expect(result.current.reached).toBe(1);
  });

  it('batches scroll events into one measurement per frame and stops on unmount', () => {
    const { unmount } = renderHook(() => useTimelineProgress(IDS));
    act(() => frames.splice(0).forEach(f => f(0))); // the mount measurement
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(frames).toHaveLength(1);
    unmount();
    frames = [];
    window.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(0);
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
    scrollTo({ 'a-dot': 100, 'b-dot': 900, 'c-dot': 1500 });
    expect(result.current.reached).toBe(1); // dots still follow position
  });
});
