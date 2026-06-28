import { describe, it, expect } from 'vitest';
import { calculateDashboardStats } from './useAdminDashboardData';
import type { AdminDashboardData } from './admin-dashboard-types';
import type { Show } from '@/types/show-types';
import type { User } from '@/types/user-types';

function makeData(overrides: Partial<AdminDashboardData> = {}): AdminDashboardData {
  return {
    users: [],
    shows: [],
    dogs: [],
    isLoading: false,
    hasError: false,
    ...overrides,
  };
}

describe('calculateDashboardStats', () => {
  it('counts active + upcoming shows as active, excluding others', () => {
    const shows = [
      { status: 'active' },
      { status: 'upcoming' },
      { status: 'completed' },
      { status: 'cancelled' },
    ] as unknown as Show[];

    const stats = calculateDashboardStats(makeData({ shows }));
    expect(stats.activeShows).toBe(2);
    expect(stats.totalShows).toBe(4);
  });

  it('reports total users and dogs from row counts', () => {
    const stats = calculateDashboardStats(
      makeData({
        users: [{ id: '1' }, { id: '2' }] as unknown as User[],
        dogs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      })
    );
    expect(stats.totalUsers).toBe(2);
    expect(stats.totalDogs).toBe(3);
  });

  it('returns zeroes for an empty platform', () => {
    const stats = calculateDashboardStats(makeData());
    expect(stats).toEqual({ activeShows: 0, totalUsers: 0, totalShows: 0, totalDogs: 0 });
  });
});
