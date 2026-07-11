import { describe, it, expect, afterEach, vi } from 'vitest';
import type { UserWithRoles } from '@/types/auth-types';
import type { ShowWithRelationship } from '@/types/unified-shows-types';
import { getShowActions } from './show-actions';

// getShowActions gates a handful of actions on the show's upcoming/active/past
// phase. These tests pin the timezone boundary: a same-day show in the local
// evening must be treated as active (neither upcoming nor past), so it shows
// neither the upcoming-only "Modify Entry" nor the past-only "My Results".
const AUTHED: UserWithRoles = { id: 'u1', roles: [], permissions: [] } as unknown as UserWithRoles;

const enteredShow = (startDate: string, endDate: string): ShowWithRelationship =>
  ({
    id: 's1',
    startDate,
    endDate,
    status: 'published',
    relationship: ['all', 'entries'],
    userCanManage: false,
    userIsJudging: false,
    userHasEntries: true,
  }) as unknown as ShowWithRelationship;

const actionIds = (show: ShowWithRelationship) =>
  getShowActions(show, 'entries', AUTHED).map(a => a.id);

describe('getShowActions phase gating (entries tab)', () => {
  afterEach(() => vi.useRealTimers());

  it('shows upcoming-only actions for a future show', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0));
    const ids = actionIds(enteredShow('2026-05-20', '2026-05-21'));
    expect(ids).toContain('modify_entry');
    expect(ids).not.toContain('my_results');
  });

  it('treats a same-day show in the local evening as active — neither upcoming nor past actions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 20, 0)); // 2026-05-15 20:00 local
    const ids = actionIds(enteredShow('2026-05-15', '2026-05-15'));
    expect(ids).not.toContain('modify_entry');
    expect(ids).not.toContain('my_results');
  });

  it('shows past-only actions once the end date has fully elapsed locally', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 16, 0, 1)); // just past local midnight next day
    const ids = actionIds(enteredShow('2026-05-15', '2026-05-15'));
    expect(ids).toContain('my_results');
    expect(ids).not.toContain('modify_entry');
  });
});
