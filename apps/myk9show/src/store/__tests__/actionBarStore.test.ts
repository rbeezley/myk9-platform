/**
 * The registry answers one question: how much of the bottom edge is covered?
 *
 * MYK9-88 — the 2026-07-24 exhibitor audit recorded a tap meant for "Save
 * Changes" landing on a toast that sat over it, navigating away and discarding
 * the edit with no prompt. Everything here exists so the toaster can be told to
 * get out of the way.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useActionBarStore, selectReservedBottom } from '../actionBarStore';

const read = () => selectReservedBottom(useActionBarStore.getState());
const { setHeight, unregister } = useActionBarStore.getState();

beforeEach(() => {
  useActionBarStore.setState({ heights: {} });
});

describe('action bar registry', () => {
  it('reserves nothing when no bar is mounted', () => {
    expect(read()).toBe(0);
  });

  it('reserves the height of a single mounted bar', () => {
    setHeight('panel', 72);
    expect(read()).toBe(72);
  });

  it('reserves the tallest bar, not the sum, when bars overlap', () => {
    // A slide-out panel over a page that has its own footer: both are mounted,
    // both are pinned to the same bottom edge. Summing would push toasts into
    // the middle of the screen.
    setHeight('page-footer', 64);
    setHeight('panel-footer', 96);
    expect(read()).toBe(96);
  });

  it('releases the reservation when a bar unmounts', () => {
    setHeight('panel', 80);
    unregister('panel');
    expect(read()).toBe(0);
  });

  it('falls back to the remaining bar when the taller one unmounts', () => {
    setHeight('page-footer', 64);
    setHeight('panel-footer', 96);
    unregister('panel-footer');
    expect(read()).toBe(64);
  });

  it('rounds sub-pixel measurements', () => {
    // getBoundingClientRect returns fractions; an unrounded value would churn
    // the toaster on every reflow.
    setHeight('panel', 71.6);
    expect(read()).toBe(72);
  });

  it('ignores a repeated identical height', () => {
    setHeight('panel', 72);
    const first = useActionBarStore.getState().heights;
    setHeight('panel', 72);
    // Same object identity proves no state update happened, so subscribers do
    // not re-render on every ResizeObserver tick.
    expect(useActionBarStore.getState().heights).toBe(first);
  });

  it('never reserves a negative offset', () => {
    setHeight('panel', -10);
    expect(read()).toBe(0);
  });
});
