/**
 * MYK9-645 — the Pending / Completed tab counts accept a host-supplied pair.
 *
 * The tabs re-derived their counts from the entries array while the class
 * header rendered the host's expected/accounted pair, so one screen carried two
 * answers ("0 of 65 completed" beside "Pending 66") for a class with one
 * withdrawn entry. The host now hands the pair in via `ClassInfo.statusCounts`;
 * the entries-array derivation remains the fallback for ringside consumers that
 * supply nothing.
 */
import { describe, it, expect } from 'vitest';
import { buildStatusTabs } from './entryListTabs';

describe('buildStatusTabs', () => {
  it('uses the entries-array derivation when the host passes no counts', () => {
    const tabs = buildStatusTabs({ pending: 66, completed: 0 });

    expect(tabs.map(tab => [tab.id, tab.count])).toEqual([
      ['pending', 66],
      ['completed', 0],
    ]);
  });

  it('prefers the host-supplied counts over the derived ones', () => {
    const tabs = buildStatusTabs({ pending: 66, completed: 0 }, { pending: 65, completed: 0 });

    expect(tabs.map(tab => [tab.id, tab.count])).toEqual([
      ['pending', 65],
      ['completed', 0],
    ]);
  });

  it('honours a host pair that is zero rather than falling back', () => {
    const tabs = buildStatusTabs({ pending: 3, completed: 1 }, { pending: 0, completed: 4 });

    expect(tabs.map(tab => [tab.id, tab.count])).toEqual([
      ['pending', 0],
      ['completed', 4],
    ]);
  });

  it('falls back when the host pair is explicitly undefined', () => {
    const tabs = buildStatusTabs({ pending: 7, completed: 2 }, undefined);

    expect(tabs.map(tab => [tab.id, tab.count])).toEqual([
      ['pending', 7],
      ['completed', 2],
    ]);
  });
});
