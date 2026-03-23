import { describe, it, expect } from 'vitest';
import { COMPLETED_STATUSES } from '../ClassEntriesTable';

function computeStatusCounts(entries: { status: string }[]) {
  let completed = 0;
  for (const entry of entries) {
    if (COMPLETED_STATUSES.has(entry.status)) completed++;
  }
  return { all: entries.length, pending: entries.length - completed, completed };
}

function filterEntries(entries: { status: string }[], filter: 'all' | 'pending' | 'completed') {
  if (filter === 'all') return entries;
  return entries.filter(entry => {
    const isCompleted = COMPLETED_STATUSES.has(entry.status);
    return filter === 'completed' ? isCompleted : !isCompleted;
  });
}

describe('ClassEntriesTable entry filtering logic', () => {
  const entries = [
    { status: 'Qualified' },
    { status: 'Not Qualified' },
    { status: '' },
    { status: '' },
    { status: 'Absent' },
  ];

  it('counts completed and pending entries correctly', () => {
    const counts = computeStatusCounts(entries);
    expect(counts).toEqual({ all: 5, pending: 2, completed: 3 });
  });

  it('returns all entries when filter is "all"', () => {
    expect(filterEntries(entries, 'all')).toHaveLength(5);
  });

  it('returns only completed entries when filter is "completed"', () => {
    const result = filterEntries(entries, 'completed');
    expect(result).toHaveLength(3);
    expect(result.every(e => COMPLETED_STATUSES.has(e.status))).toBe(true);
  });

  it('returns only pending entries when filter is "pending"', () => {
    const result = filterEntries(entries, 'pending');
    expect(result).toHaveLength(2);
    expect(result.every(e => !COMPLETED_STATUSES.has(e.status))).toBe(true);
  });

  it('handles all-pending entries', () => {
    const allPending = [{ status: '' }, { status: '' }];
    const counts = computeStatusCounts(allPending);
    expect(counts).toEqual({ all: 2, pending: 2, completed: 0 });
  });

  it('handles all-completed entries', () => {
    const allDone = [{ status: 'Qualified' }, { status: 'Excused' }];
    const counts = computeStatusCounts(allDone);
    expect(counts).toEqual({ all: 2, pending: 0, completed: 2 });
  });
});
