import { describe, expect, it } from 'vitest';
import { buildEntryListTools, getEntryListHref, sumEntryListCounts } from '../entryManagementViews';
import { normalizeEntryManagementCockpitParams } from '../entryManagementCockpitParams';

describe('buildEntryListTools', () => {
  const counts = { pulls: 4, moveUps: 5, registrationNeeded: 2, waitlist: 3 };

  it('lists Pulls, Move-ups, Registration number needed, Waitlist and Check-in desk in the Entry lists group', () => {
    const tools = buildEntryListTools('show-1', counts);
    expect(tools.map(tool => [tool.title, tool.group])).toEqual([
      ['Pulls', 'entry-lists'],
      ['Move-ups', 'entry-lists'],
      ['Registration number needed', 'entry-lists'],
      ['Waitlist', 'entry-lists'],
      ['Check-in desk', 'entry-lists'],
    ]);
  });

  it('badges a list with a non-zero count, Waitlist included', () => {
    const tools = buildEntryListTools('show-1', counts);
    expect(tools.map(tool => tool.attentionLabel)).toEqual(['4', '5', '2', '3', undefined]);
  });

  it('shows no badge for a zero or an unknown count rather than a confident 0', () => {
    const tools = buildEntryListTools('show-1', {
      pulls: 0,
      moveUps: undefined,
      registrationNeeded: undefined,
      waitlist: undefined,
    });
    expect(tools.some(tool => 'attentionLabel' in tool)).toBe(false);
  });

  it('links each list by the URL contract the page reads, so old deep links and menu rows agree', () => {
    expect(getEntryListHref('show-1', 'pulls')).toBe(
      '/shows/show-1/entries?tab=exceptions&exception=pulls'
    );
    expect(getEntryListHref('show-1', 'move-ups')).toBe('/shows/show-1/entries?tab=exceptions');
    for (const tool of buildEntryListTools('show-1', counts)) {
      const query = new URLSearchParams(tool.href?.split('?')[1]);
      expect(normalizeEntryManagementCockpitParams(query).state.tab).toBe('exceptions');
    }
  });

  it('opens the Check-in desk and keeps its not-checked-in filter in the URL', () => {
    expect(getEntryListHref('show-1', 'check-in')).toBe(
      '/shows/show-1/entries?tab=exceptions&exception=check-in'
    );
    const kept = normalizeEntryManagementCockpitParams(
      new URLSearchParams('tab=exceptions&exception=check-in&checkin=pending')
    );
    expect(kept.state.exception).toBe('check-in');
    expect(kept.params.toString()).toBe('tab=exceptions&exception=check-in&checkin=pending');
    // The filter belongs to the desk: any other list drops it.
    const dropped = normalizeEntryManagementCockpitParams(
      new URLSearchParams('tab=exceptions&exception=pulls&checkin=pending')
    );
    expect(dropped.params.toString()).toBe('tab=exceptions&exception=pulls');
  });

  it('sums only the counts that are known', () => {
    expect(sumEntryListCounts(counts)).toBe(14);
    expect(
      sumEntryListCounts({
        pulls: 1,
        moveUps: undefined,
        registrationNeeded: undefined,
        waitlist: undefined,
      })
    ).toBe(1);
  });
});
