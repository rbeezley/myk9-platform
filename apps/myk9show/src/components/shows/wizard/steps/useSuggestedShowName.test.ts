/**
 * MYK9-1799 (owner decision 2026-11-09): a new show's name is suggested from the club and
 * the month it starts, and the suggestion never replaces a name that is the secretary's.
 */
import { StrictMode } from 'react';
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

/** The wizard store's record of the name the hook wrote; it outlives a step remount. */
function createOwnership() {
  const owned = { value: null as string | null };
  return { owned, setOwned: (value: string | null) => void (owned.value = value) };
}

function setup(
  initial: Props = {},
  options: { strict?: boolean; ownership?: ReturnType<typeof createOwnership> } = {}
) {
  const setName = vi.fn<(name: string) => void>();
  const ownership = options.ownership ?? createOwnership();
  const withDefaults = (props: Props) => ({
    enabled: props.enabled ?? true,
    draftGeneration: props.draftGeneration ?? 0,
    clubName: 'clubName' in props ? props.clubName : 'Heartland',
    startDate: props.startDate ?? day(2026, 10, 10),
    name: props.name ?? '',
    setName,
    suggestedName: ownership.owned.value,
    setSuggestedName: ownership.setOwned,
  });
  const hook = renderHook((props: Props) => useSuggestedShowName(withDefaults(props)), {
    initialProps: initial,
    ...(options.strict ? { wrapper: StrictMode } : {}),
  });
  return { setName, rerender: hook.rerender, unmount: hook.unmount };
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

  it('goes on following the dates after she leaves the step and comes back', () => {
    const ownership = createOwnership();
    const first = setup({}, { ownership });
    first.rerender({ name: 'Heartland October 2026' });
    first.unmount();

    // A new mount, as Next then Back gives: the name is still the suggestion for these dates.
    const { setName, rerender } = setup({ name: 'Heartland October 2026' }, { ownership });
    expect(setName).not.toHaveBeenCalled();
    rerender({ name: 'Heartland October 2026', startDate: day(2026, 11, 14) });

    expect(setName).toHaveBeenCalledWith('Heartland November 2026');
  });

  it('does not take its own write for her edit when the effect re-runs before it lands', () => {
    // StrictMode runs the mount effect twice with the same props: the second run still
    // sees the blank name the first one replaced.
    const { setName, rerender } = setup({}, { strict: true });
    expect(setName).toHaveBeenCalledWith('Heartland October 2026');

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

  it('does not rename a name she typed that equals the suggestion, after a look at Trials', () => {
    const ownership = createOwnership();
    // She typed the exact suggestion herself, before the hook wrote anything.
    const first = setup({ clubName: undefined, name: 'Heartland October 2026' }, { ownership });
    first.rerender({ name: 'Heartland October 2026' });
    first.rerender({ name: 'Heartland October 2026', clubName: 'Heartland' });
    first.unmount();

    const { setName, rerender } = setup({ name: 'Heartland October 2026' }, { ownership });
    rerender({ name: 'Heartland October 2026', startDate: day(2026, 11, 14) });

    expect(setName).not.toHaveBeenCalled();
  });

  it('does not rename a draft resumed from this device whose name equals the suggestion', () => {
    const { setName, rerender } = setup({ name: 'Heartland October 2026' });

    rerender({ name: 'Heartland October 2026', startDate: day(2026, 11, 14) });

    expect(setName).not.toHaveBeenCalled();
  });

  it('forgets the ownership when she edits its name, so a remount leaves her name alone', () => {
    const ownership = createOwnership();
    const first = setup({}, { ownership });
    first.rerender({ name: 'Heartland October 2026' });
    first.rerender({ name: 'Heartland October 2026!' });
    first.rerender({ name: 'Heartland October 2026' });
    first.unmount();

    const { setName, rerender } = setup({ name: 'Heartland October 2026' }, { ownership });
    rerender({ name: 'Heartland October 2026', startDate: day(2026, 11, 14) });

    expect(setName).not.toHaveBeenCalled();
  });

  it('keeps following the dates when a clone is begun and cancelled over its own name', () => {
    const ownership = createOwnership();
    const { setName, rerender } = setup({}, { ownership });
    rerender({ name: 'Heartland October 2026' });
    setName.mockClear();

    // beginCloneHydration bumps the generation and leaves the draft and the record alone.
    rerender({ name: 'Heartland October 2026', draftGeneration: 1 });
    rerender({ name: 'Heartland October 2026', draftGeneration: 2 });
    rerender({ name: 'Heartland October 2026', draftGeneration: 2, startDate: day(2026, 11, 14) });

    expect(setName).toHaveBeenCalledWith('Heartland November 2026');
  });
});
