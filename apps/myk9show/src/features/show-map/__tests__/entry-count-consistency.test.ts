// Entry counts must stay synchronized across the Show Details tab badge and
// the show-map summary tile. "Entries" means the show catalog roster: all
// non-deleted entries for the show, including terminal states such as scratched
// or withdrawn.
import { describe, expect, it } from 'vitest';
import { countCatalogEntries, type CatalogEntryLike } from '../entryCounts';

describe('entry count divergence prevention', () => {
  it('counts the catalog roster, including terminal entry statuses', () => {
    const entries: CatalogEntryLike[] = [
      { entry_status: 'submitted' },
      { entry_status: 'withdrawn' },
      { entry_status: 'not_accepted' },
      { entry_status: 'moved' },
      { entry_status: 'scratched' },
    ];

    expect(countCatalogEntries(entries)).toBe(5);
  });

  it('excludes deleted entries from the catalog roster', () => {
    const entries: CatalogEntryLike[] = [
      { entry_status: 'submitted' },
      { entry_status: 'scratched', deleted_at: '2026-05-16T12:00:00.000Z' },
      { entry_status: 'withdrawn', deletedAt: '2026-05-16T12:00:00.000Z' },
    ];

    expect(countCatalogEntries(entries)).toBe(1);
  });
});
