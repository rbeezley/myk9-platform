import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { DEFAULT_USER_FILTER } from '../UserManagementPage.types';
import { UserListToolbar } from '../UserListToolbar';
import type { User } from '@/types/user-types';

const USERS = [{ id: 'u1' }, { id: 'u2' }] as unknown as User[];

function renderToolbar(filters = DEFAULT_USER_FILTER, hasActiveFilters = false) {
  const onClearAll = vi.fn();
  const view = render(
    <UserListToolbar
      users={USERS}
      now={Date.UTC(2026, 6, 1)}
      matchCount={0}
      searchTerm="ada"
      onSearchChange={vi.fn()}
      filters={filters}
      onFiltersChange={vi.fn()}
      onClearAll={onClearAll}
      selectedCount={0}
      onSelectAllMatching={vi.fn()}
      hasActiveFilters={hasActiveFilters}
    />
  );
  return { ...view, onClearAll };
}

describe('UserListToolbar status sentence (MYK9-906)', () => {
  it('names a status/login combination that matches no view, and Show all clears it', async () => {
    const { onClearAll, user } = renderToolbar(
      { ...DEFAULT_USER_FILTER, status: 'suspended', login: 'never' },
      true
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 0 of 2 users (Status: suspended, Last sign-in: never, matching \u201cada\u201d).'
    );
    await user.click(screen.getByRole('button', { name: 'Show all users' }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});
