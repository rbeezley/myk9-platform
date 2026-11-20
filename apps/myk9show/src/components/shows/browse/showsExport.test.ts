import { describe, it, expect } from 'vitest';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { showsExportRows } from './showsExport';

function show(id: string): EnhancedShow {
  return {
    id,
    name: `Show ${id}`,
    organization: 'AKC',
    startDate: '2099-10-20',
    endDate: '2099-10-22',
    location: 'Tulsa, OK',
    status: 'published',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2000-01-01',
    entryCloseDate: '2099-10-06',
    onlineEntriesEnabled: true,
    clubName: 'Club',
    userHasEntries: false,
  } as unknown as EnhancedShow;
}

describe('showsExportRows (MYK9-2192)', () => {
  it('labels a paused show the way the table does', () => {
    const rows = showsExportRows([show('a'), show('b')], new Set(['a']));
    expect(rows[0]?.[3]).toBe('Entries Paused');
    expect(rows[1]?.[3]).not.toBe('Entries Paused');
  });
});
