import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { DEFAULT_USER_FILTER } from '../UserManagementPage.types';
import { UserListToolbar } from '../UserListToolbar';
import type { User } from '@/types/user-types';

const USERS = [{ id: 'u1' }, { id: 'u2' }] as unknown as User[];

function renderToolbar(options: { filtered?: boolean; ready?: boolean; matchCount?: number } = {}) {
  const { filtered = false, ready = true, matchCount = 2 } = options;
  const onClearAll = vi.fn();
  const view = render(
    <UserListToolbar
      users={USERS}
      now={Date.UTC(2026, 6, 1)}
      matchCount={matchCount}
      searchTerm=""
      onSearchChange={vi.fn()}
      filters={DEFAULT_USER_FILTER}
      onFiltersChange={vi.fn()}
      onClearAll={onClearAll}
      selectedCount={0}
      onSelectAllMatching={vi.fn()}
      hasActiveFilters={filtered}
      ready={ready}
    />
  );
  return { ...view, onClearAll };
}

describe('UserListToolbar status sentence (MYK9-906)', () => {
  it('says "Showing X of Y" while filtered and Show all clears it', async () => {
    const { onClearAll, user } = renderToolbar({ filtered: true, matchCount: 1 });
    expect(screen.getByRole('status').textContent).toBe('Showing 1 of 2 users.');
    await user.click(screen.getByRole('button', { name: 'Show all users' }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it('says "Showing all" with no button when unfiltered', () => {
    renderToolbar();
    expect(screen.getByRole('status').textContent).toBe('Showing all 2 users.');
    expect(screen.queryByRole('button', { name: 'Show all users' })).not.toBeInTheDocument();
  });

  it('shows no sentence until the roster has loaded', () => {
    renderToolbar({ ready: false });
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
  });
});
