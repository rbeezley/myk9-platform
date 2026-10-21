import { describe, expect, it, vi } from 'vitest';
import { showFactory } from '@/test/utils/factories';
import type { Show } from '@/types/show-types';
import { groupShowsForPane } from '@/components/shows/browse/showsPaneGroups';
import {
  pickCurrentShow,
  readCurrentShowChoice,
  readLastOpenedShowId,
  truncateRailTitle,
  writeCurrentShowChoice,
  writeLastOpenedShowId,
} from '../currentShow';

const NOW = new Date('2026-10-15T16:00:00Z');
const make = (overrides: Partial<Show>) =>
  showFactory.build({ status: 'published', entryWindowTimeZone: 'America/Chicago', ...overrides });

const today = make({
  id: 'today',
  name: 'Today Trial',
  startDate: '2026-10-14',
  endDate: '2026-10-16',
});
const soon = make({
  id: 'soon',
  name: 'Soon Trial',
  startDate: '2026-10-20',
  endDate: '2026-10-21',
});
const later = make({
  id: 'later',
  name: 'Later Trial',
  startDate: '2026-11-20',
  endDate: '2026-11-21',
});
const over = make({
  id: 'over',
  name: 'Over Trial',
  startDate: '2026-10-01',
  endDate: '2026-10-02',
});

// The inputs exactly as useCurrentShow builds them: Managing out of the Shows list's grouping.
function inputs(
  managed: Show[],
  lastOpenedId: string | null = null,
  rememberedChoice: string | null = null
) {
  const ids = new Set(managed.map(show => show.id));
  const managing =
    groupShowsForPane(managed, show => ids.has(show.id), NOW).find(g => g.id === 'managing')
      ?.shows ?? [];
  return { managingShows: managing, managedShows: managed, lastOpenedId, rememberedChoice };
}

describe('pickCurrentShow', () => {
  it('rule 1: a show happening today wins over an earlier-starting upcoming one', () => {
    expect(pickCurrentShow(inputs([later, soon, today]))?.id).toBe('today');
  });

  it('rule 2: otherwise the soonest upcoming show', () => {
    expect(pickCurrentShow(inputs([later, soon]))?.id).toBe('soon');
  });

  it('rule 3: otherwise the last managed show opened, even one that is over', () => {
    expect(pickCurrentShow(inputs([over], 'over'))?.id).toBe('over');
  });

  it('rule 3 ignores a last-opened show the viewer does not manage', () => {
    expect(pickCurrentShow(inputs([over], 'someone-elses'))).toBeNull();
  });

  it('prefers a current show to the last one opened', () => {
    expect(pickCurrentShow(inputs([soon, over], 'over'))?.id).toBe('soon');
  });

  it('is none when the viewer manages nothing', () => {
    expect(pickCurrentShow(inputs([]))).toBeNull();
    expect(pickCurrentShow(inputs([], 'over', 'soon'))).toBeNull();
  });

  it('tie: two shows today give the soonest-starting, and a Switch choice overrides it', () => {
    const tied = make({
      id: 'tied',
      name: 'Tied Trial',
      startDate: '2026-10-15',
      endDate: '2026-10-15',
    });
    expect(pickCurrentShow(inputs([tied, today]))?.id).toBe('today');
    expect(pickCurrentShow(inputs([tied, today], null, 'tied'))?.id).toBe('tied');
  });

  it('drops a remembered choice once that show is over or no longer managed', () => {
    expect(pickCurrentShow(inputs([over, soon], null, 'over'))?.id).toBe('soon');
    expect(pickCurrentShow(inputs([soon], null, 'gone'))?.id).toBe('soon');
  });
});

describe('truncateRailTitle', () => {
  it.each([
    ['Spring Trial', 'Spring Trial'],
    ['  Spring Trial  ', 'Spring Trial'],
    ['Heartland Spring Nosework Trial', 'Heartland Spring…'],
    ['Heartland Nosework Trial', 'Heartland Nosework…'],
    ['Supercalifragilisticexpialidocious', 'Supercalifragilist…'],
  ])('%s -> %s', (name, expected) => {
    expect(truncateRailTitle(name)).toBe(expected);
  });
});

describe('current show storage', () => {
  it('round-trips the last opened show and the Switch choice', () => {
    writeLastOpenedShowId('a');
    writeCurrentShowChoice('b');
    expect(readLastOpenedShowId()).toBe('a');
    expect(readCurrentShowChoice()).toBe('b');
  });

  it('reads none, and writes silently, when storage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(readLastOpenedShowId()).toBeNull();
      expect(readCurrentShowChoice()).toBeNull();
      expect(() => writeCurrentShowChoice('x')).not.toThrow();
      expect(() => writeLastOpenedShowId('x')).not.toThrow();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
