/**
 * MYK9-1799 (owner decision 2026-11-09): a new show's name is suggested from the club and
 * the month it starts, and the suggestion never replaces a name that is the secretary's.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { suggestShowName, useSuggestedShowName } from './useSuggestedShowName';

/** The wizard's own encoding of a picked day: the local day's instant, as ISO text. */
const day = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date).toISOString();

describe('suggestShowName', () => {
  it('names the club and the month the show starts', () => {
    expect(suggestShowName('Heartland Scent Work Club', day(2026, 10, 10))).toBe(
      'Heartland Scent Work Club October 2026'
    );
  });

  it('reads the month the way the date field shows it, for a show on the 1st', () => {
    expect(suggestShowName('Heartland', day(2027, 1, 1))).toBe('Heartland January 2027');
  });

  it('waits until both the club and the date are known', () => {
    expect(suggestShowName(undefined, day(2026, 10, 10))).toBeNull();
    expect(suggestShowName('   ', day(2026, 10, 10))).toBeNull();
    expect(suggestShowName('Heartland', '')).toBeNull();
    expect(suggestShowName('Heartland', 'not a date')).toBeNull();
  });
});

interface Props {
  enabled?: boolean;
  draftGeneration?: number;
  clubName?: string | undefined;
  startDate?: string;
  name?: string;
}

function setup(initial: Props = {}) {
  const setName = vi.fn<(name: string) => void>();
  const withDefaults = (props: Props) => ({
    enabled: props.enabled ?? true,
    draftGeneration: props.draftGeneration ?? 0,
    clubName: 'clubName' in props ? props.clubName : 'Heartland',
    startDate: props.startDate ?? day(2026, 10, 10),
    name: props.name ?? '',
    setName,
  });
  const hook = renderHook((props: Props) => useSuggestedShowName(withDefaults(props)), {
    initialProps: initial,
  });
  return { setName, rerender: hook.rerender };
}

describe('useSuggestedShowName', () => {
  it('fills an empty name once the club and date are known', () => {
    const { setName, rerender } = setup({ clubName: undefined });
    expect(setName).not.toHaveBeenCalled();

    rerender({});

    expect(setName).toHaveBeenCalledWith('Heartland October 2026');
  });

  it('keeps its own suggestion in step when she changes the dates', () => {
    const { setName, rerender } = setup();
    rerender({ name: 'Heartland October 2026' });

    rerender({ name: 'Heartland October 2026', startDate: day(2026, 11, 14) });

    expect(setName).toHaveBeenLastCalledWith('Heartland November 2026');
  });

  it('never replaces a name she typed, even after the dates change', () => {
    const { setName, rerender } = setup({ name: 'Fall Classic' });

    rerender({ name: 'Fall Classic', startDate: day(2026, 11, 14) });

    expect(setName).not.toHaveBeenCalled();
  });

  it('stays out of the way once she edits or empties the suggested name', () => {
    const { setName, rerender } = setup();
    rerender({ name: 'Heartland October 2026' });
    expect(setName).toHaveBeenCalledTimes(1);

    // She clears the field to type her own; refilling it here would fight her.
    rerender({ name: '' });
    rerender({ name: 'M' });
    rerender({ name: 'M', startDate: day(2026, 11, 14) });

    expect(setName).toHaveBeenCalledTimes(1);
  });

  it('holds off while a clone is loading, and the cloned name is hers', () => {
    const { setName, rerender } = setup({ enabled: false });
    expect(setName).not.toHaveBeenCalled();

    rerender({ enabled: true, draftGeneration: 1, name: 'Spring Cup (cloned)' });

    expect(setName).not.toHaveBeenCalled();
  });

  it('suggests again for the next new show after she starts fresh', () => {
    const { setName, rerender } = setup({ name: 'Fall Classic' });
    expect(setName).not.toHaveBeenCalled();

    rerender({ draftGeneration: 1, name: '' });

    expect(setName).toHaveBeenCalledWith('Heartland October 2026');
  });
});
