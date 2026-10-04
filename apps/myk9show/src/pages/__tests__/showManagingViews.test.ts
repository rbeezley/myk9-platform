import { describe, it, expect } from 'vitest';
import type { Show } from '@/types/show-types';
import {
  MANAGING_VIEW_IDS,
  activeManagingViewId,
  buildManagingViews,
  managingViewFilters,
  matchesManagingView,
} from '../showManagingViews';

function localISODate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeShow(overrides: Partial<Show> & { id: string }): Show {
  return {
    name: 'Test Show',
    organization: 'AKC',
    startDate: localISODate(30),
    endDate: localISODate(31),
    location: 'Test City, CA',
    status: 'published',
    events: ['Scent Work'],
    source: 'myK9Show',
    entryOpenDate: localISODate(-5),
    entryCloseDate: localISODate(20),
    onlineEntriesEnabled: true,
    preEntryFee: '25',
    clubId: 'club-1',
    clubName: 'Test Club',
    clubAddress: '123 Main St',
    clubEmail: 'club@example.com',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    ...overrides,
  } as Show;
}

describe('showManagingViews', () => {
  it('MANAGING_VIEW_IDS excludes "all"', () => {
    expect(MANAGING_VIEW_IDS).not.toContain('all');
    expect(MANAGING_VIEW_IDS).toEqual([
      'draft',
      'open',
      'closing_soon',
      'in_progress',
      'completed',
      'cancelled',
    ]);
  });

  it('matches lifecycle views (draft/in_progress/completed/cancelled) directly on show.status', () => {
    expect(matchesManagingView(makeShow({ id: 's1', status: 'draft' }), [], 'draft')).toBe(true);
    expect(
      matchesManagingView(makeShow({ id: 's2', status: 'in_progress' }), [], 'in_progress')
    ).toBe(true);
    expect(matchesManagingView(makeShow({ id: 's3', status: 'completed' }), [], 'completed')).toBe(
      true
    );
    expect(matchesManagingView(makeShow({ id: 's4', status: 'cancelled' }), [], 'cancelled')).toBe(
      true
    );
    expect(matchesManagingView(makeShow({ id: 's5', status: 'draft' }), [], 'completed')).toBe(
      false
    );
  });

  it('"open" matches a published show currently accepting entries', () => {
    const show = makeShow({
      id: 's1',
      status: 'published',
      entryOpenDate: localISODate(-5),
      entryCloseDate: localISODate(20),
    });
    expect(matchesManagingView(show, [], 'open')).toBe(true);
    expect(matchesManagingView(show, [], 'closing_soon')).toBe(false);
  });

  it('"closing_soon" matches a published show within 7 days of its entry close', () => {
    const show = makeShow({
      id: 's1',
      status: 'published',
      entryOpenDate: localISODate(-10),
      entryCloseDate: localISODate(3),
    });
    expect(matchesManagingView(show, [], 'closing_soon')).toBe(true);
    expect(matchesManagingView(show, [], 'open')).toBe(false);
  });

  it('a draft show never matches "open" or "closing_soon" even with an entry window set', () => {
    const show = makeShow({
      id: 's1',
      status: 'draft',
      entryOpenDate: localISODate(-5),
      entryCloseDate: localISODate(20),
    });
    expect(matchesManagingView(show, [], 'open')).toBe(false);
    expect(matchesManagingView(show, [], 'closing_soon')).toBe(false);
  });

  it('"all" matches every show', () => {
    const shows = [
      makeShow({ id: 's1', status: 'draft' }),
      makeShow({ id: 's2', status: 'cancelled' }),
    ];
    for (const show of shows) {
      expect(matchesManagingView(show, [], 'all')).toBe(true);
    }
  });

  it('buildManagingViews counts match matchesManagingView exactly', () => {
    const shows = [
      makeShow({ id: 'draft-1', status: 'draft' }),
      makeShow({
        id: 'open-1',
        status: 'published',
        entryOpenDate: localISODate(-5),
        entryCloseDate: localISODate(20),
      }),
      makeShow({
        id: 'closing-1',
        status: 'published',
        entryOpenDate: localISODate(-10),
        entryCloseDate: localISODate(2),
      }),
      makeShow({ id: 'progress-1', status: 'in_progress' }),
      makeShow({ id: 'completed-1', status: 'completed' }),
      makeShow({ id: 'cancelled-1', status: 'cancelled' }),
    ];

    const views = buildManagingViews(shows, []);
    const countFor = (id: string) => shows.filter(s => matchesManagingView(s, [], id)).length;

    expect(views).toEqual([
      { id: 'all', label: 'All', count: countFor('all') },
      { id: 'draft', label: 'Draft', count: countFor('draft') },
      { id: 'open', label: 'Open for entries', count: countFor('open') },
      { id: 'closing_soon', label: 'Closing soon', count: countFor('closing_soon') },
      { id: 'in_progress', label: 'In progress', count: countFor('in_progress') },
      { id: 'completed', label: 'Completed', count: countFor('completed') },
      { id: 'cancelled', label: 'Cancelled', count: countFor('cancelled') },
    ]);
    expect(views.find(v => v.id === 'all')?.count).toBe(6);
    expect(views.find(v => v.id === 'draft')?.count).toBe(1);
    expect(views.find(v => v.id === 'open')?.count).toBe(1);
    expect(views.find(v => v.id === 'closing_soon')?.count).toBe(1);
  });

  it('activeManagingViewId and managingViewFilters round-trip every id, falling back to "all"', () => {
    for (const id of ['all', ...MANAGING_VIEW_IDS]) {
      expect(activeManagingViewId(id)).toBe(id);
      expect(managingViewFilters(id)).toBe(id);
    }
    expect(activeManagingViewId('bogus')).toBe('all');
    expect(managingViewFilters('bogus')).toBe('all');
  });
});
