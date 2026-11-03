import { describe, it, expect } from 'vitest';
import type { ShowAnnouncement } from '@/types/announcement-types';
import { filterAndSortAnnouncements } from '../announcementListControls';

function ann(id: string, over: Partial<ShowAnnouncement>): ShowAnnouncement {
  return {
    id,
    title: id,
    content: '',
    priority: 'normal',
    is_read: false,
    created_at: '2026-11-01T10:00:00Z',
    ...over,
  } as ShowAnnouncement;
}

const list = [
  ann('a-new-read', { created_at: '2026-11-03T10:00:00Z', is_read: true }),
  ann('b-mid-urgent', { created_at: '2026-11-02T10:00:00Z', priority: 'urgent' }),
  ann('c-old-high', {
    created_at: '2026-11-01T10:00:00Z',
    priority: 'high',
    content: 'Ring 3 moved',
  }),
  ann('d-old-normal', { created_at: '2026-10-31T10:00:00Z' }),
];
const ids = (items: ShowAnnouncement[]) => items.map(i => i.id);
const base = { query: '', sort: 'newest' as const, unreadOnly: false };

describe('filterAndSortAnnouncements', () => {
  it('sorts newest and oldest', () => {
    expect(ids(filterAndSortAnnouncements(list, base))).toEqual([
      'a-new-read',
      'b-mid-urgent',
      'c-old-high',
      'd-old-normal',
    ]);
    expect(ids(filterAndSortAnnouncements(list, { ...base, sort: 'oldest' }))[0]).toBe(
      'd-old-normal'
    );
  });
  it('sorts priority urgent > high > normal, ties newest first', () => {
    expect(ids(filterAndSortAnnouncements(list, { ...base, sort: 'priority' }))).toEqual([
      'b-mid-urgent',
      'c-old-high',
      'a-new-read',
      'd-old-normal',
    ]);
  });
  it('sorts unread first, ties newest first', () => {
    expect(ids(filterAndSortAnnouncements(list, { ...base, sort: 'unread' }))).toEqual([
      'b-mid-urgent',
      'c-old-high',
      'd-old-normal',
      'a-new-read',
    ]);
  });
  it('searches title and body, case-insensitive and trimmed', () => {
    expect(ids(filterAndSortAnnouncements(list, { ...base, query: '  RING 3 ' }))).toEqual([
      'c-old-high',
    ]);
    expect(ids(filterAndSortAnnouncements(list, { ...base, query: 'MID-urg' }))).toEqual([
      'b-mid-urgent',
    ]);
    expect(filterAndSortAnnouncements(list, { ...base, query: 'zzz' })).toEqual([]);
  });
  it('combines unread-only with search', () => {
    expect(
      ids(filterAndSortAnnouncements(list, { ...base, unreadOnly: true, query: 'new' }))
    ).toEqual([]);
  });
});
