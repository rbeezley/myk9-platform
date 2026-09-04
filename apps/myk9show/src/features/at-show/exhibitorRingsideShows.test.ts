import { describe, it, expect } from 'vitest';
import { selectExhibitorUpcomingShows, type ExhibitorEntryRow } from './exhibitorRingsideShows';

const NOW = new Date('2026-06-23T12:00:00');

function row(overrides: Partial<ExhibitorEntryRow> = {}): ExhibitorEntryRow {
  return {
    entry_status: 'confirmed',
    check_in_status: null,
    deleted_at: null,
    show: {
      id: 'show-1',
      name: 'Autumn Classic',
      status: 'published',
      start_date: '2026-07-04',
      end_date: '2026-07-05',
      deleted_at: null,
    },
    ...overrides,
  };
}

describe('selectExhibitorUpcomingShows', () => {
  it('returns a show the exhibitor is entered in that has not started yet', () => {
    expect(selectExhibitorUpcomingShows([row()], NOW)).toEqual([
      { showId: 'show-1', showName: 'Autumn Classic' },
    ]);
  });

  it('collapses many entry rows for the same show into one reference', () => {
    const rows = [row(), row(), row()];
    expect(selectExhibitorUpcomingShows(rows, NOW)).toHaveLength(1);
  });

  it('drops a show that is already running today', () => {
    const running = row({
      show: {
        id: 'show-1',
        name: 'Autumn Classic',
        start_date: '2026-06-22',
        end_date: '2026-06-24',
        deleted_at: null,
      },
    });
    expect(selectExhibitorUpcomingShows([running], NOW)).toEqual([]);
  });

  it('drops a show whose dates have passed', () => {
    const past = row({
      show: {
        id: 'show-1',
        name: 'Spring Trial',
        start_date: '2026-05-01',
        end_date: '2026-05-02',
        deleted_at: null,
      },
    });
    expect(selectExhibitorUpcomingShows([past], NOW)).toEqual([]);
  });

  it('treats a show with no end date as a single-day show', () => {
    const singleDay = row({
      show: {
        id: 'show-1',
        name: 'One Day Trial',
        start_date: '2026-07-04',
        end_date: null,
        deleted_at: null,
      },
    });
    expect(selectExhibitorUpcomingShows([singleDay], NOW)).toEqual([
      { showId: 'show-1', showName: 'One Day Trial' },
    ]);
  });

  it.each([
    ['withdrawn', 'withdrawn'],
    ['scratched', 'scratched'],
    ['not accepted', 'not_accepted'],
  ])('drops a %s entry', (_label, entryStatus) => {
    expect(selectExhibitorUpcomingShows([row({ entry_status: entryStatus })], NOW)).toEqual([]);
  });

  it('drops a pulled entry even when its entry status is still active', () => {
    const pulled = row({ entry_status: 'confirmed', check_in_status: 'pulled' });
    expect(selectExhibitorUpcomingShows([pulled], NOW)).toEqual([]);
  });

  it('keeps a waitlisted entry — the exhibitor still needs show-day access', () => {
    expect(selectExhibitorUpcomingShows([row({ entry_status: 'waitlisted' })], NOW)).toEqual([
      { showId: 'show-1', showName: 'Autumn Classic' },
    ]);
  });

  it('drops a soft-deleted entry row', () => {
    expect(selectExhibitorUpcomingShows([row({ deleted_at: '2026-06-01' })], NOW)).toEqual([]);
  });

  it('drops an entry whose show is soft-deleted', () => {
    const deletedShow = row({
      show: {
        id: 'show-1',
        name: 'Cancelled Trial',
        start_date: '2026-07-04',
        end_date: '2026-07-05',
        deleted_at: '2026-06-01',
      },
    });
    expect(selectExhibitorUpcomingShows([deletedShow], NOW)).toEqual([]);
  });

  it('drops a row whose show relation has not replicated yet', () => {
    expect(selectExhibitorUpcomingShows([row({ show: null })], NOW)).toEqual([]);
  });

  it('drops a row whose show has no name to label the card with', () => {
    const nameless = row({
      show: {
        id: 'show-1',
        name: null,
        start_date: '2026-07-04',
        end_date: null,
        deleted_at: null,
      },
    });
    expect(selectExhibitorUpcomingShows([nameless], NOW)).toEqual([]);
  });

  it('returns every distinct upcoming show, not just the first', () => {
    const rows = [
      row(),
      row({
        show: {
          id: 'show-2',
          name: 'Winter Trial',
          start_date: '2026-08-01',
          end_date: '2026-08-02',
          deleted_at: null,
        },
      }),
    ];
    expect(selectExhibitorUpcomingShows(rows, NOW).map(s => s.showId)).toEqual([
      'show-1',
      'show-2',
    ]);
  });

  // A terminal status WINS over the date range, matching useMyShows.toPhase.
  // A show the secretary cancelled next month is over, and pointing an
  // exhibitor at its ringside is a dead end. (Codex review, MYK9-379.)
  it.each(['cancelled', 'completed', 'draft'])(
    'drops a future show whose status is %s',
    status => {
      const terminal = row({
        show: {
          id: 'show-1',
          name: 'Autumn Classic',
          status,
          start_date: '2026-07-04',
          end_date: '2026-07-05',
          deleted_at: null,
        },
      });
      expect(selectExhibitorUpcomingShows([terminal], NOW)).toEqual([]);
    }
  );

  it.each(['published', 'upcoming', 'in_progress'])('keeps a future show in %s', status => {
    const live = row({
      show: {
        id: 'show-1',
        name: 'Autumn Classic',
        status,
        start_date: '2026-07-04',
        end_date: '2026-07-05',
        deleted_at: null,
      },
    });
    expect(selectExhibitorUpcomingShows([live], NOW)).toEqual([
      { showId: 'show-1', showName: 'Autumn Classic' },
    ]);
  });

  // The replicated path maps show.status, the PostgREST path must select it —
  // an absent status must not silently drop every show on one of the two paths.
  it('keeps a show whose status is absent from the row', () => {
    const noStatus = row({
      show: {
        id: 'show-1',
        name: 'Autumn Classic',
        start_date: '2026-07-04',
        end_date: '2026-07-05',
        deleted_at: null,
      },
    });
    expect(selectExhibitorUpcomingShows([noStatus], NOW)).toEqual([
      { showId: 'show-1', showName: 'Autumn Classic' },
    ]);
  });
});
