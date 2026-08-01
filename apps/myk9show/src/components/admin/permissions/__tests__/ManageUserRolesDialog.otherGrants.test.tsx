import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';

type Row = {
  id: string;
  role_id: string;
  club_id: string | null;
  show_id: string | null;
  expires_at: string | null;
  roles: { name: string } | null;
};

let mockUserRoleRows: Row[] = [];
let capturedUserRolesSelect: string | null = null;

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'clubs') {
        return {
          select: () => ({
            is: () => ({
              order: () =>
                Promise.resolve({ data: [{ id: 'club-1', name: 'Blue Ridge' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: (columns: string) => {
          capturedUserRolesSelect = columns;
          return {
            eq: () => ({
              eq: () => Promise.resolve({ data: mockUserRoleRows, error: null }),
            }),
          };
        },
      };
    },
  },
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn().mockResolvedValue([{ id: 'role-1', name: 'judge' }]),
    assignRole: vi.fn().mockResolvedValue(undefined),
    revokeRole: vi.fn().mockResolvedValue(undefined),
  },
}));

import { ManageUserRolesDialog } from '../ManageUserRolesDialog';

const user = { id: 'user-1', firstName: 'Jane', lastName: 'Doe' } as User;

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ManageUserRolesDialog open onOpenChange={vi.fn()} user={user} onSaved={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ManageUserRolesDialog — other grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleRows = [];
    capturedUserRolesSelect = null;
  });

  it('stays out of the way when every grant is editable here', async () => {
    mockUserRoleRows = [
      {
        id: 'ur-1',
        role_id: 'role-1',
        club_id: 'club-1',
        show_id: null,
        expires_at: null,
        roles: { name: 'secretary' },
      },
    ];
    renderDialog();
    expect(await screen.findByText(/manage roles/i)).toBeInTheDocument();
    expect(screen.queryByText(/other grants/i)).not.toBeInTheDocument();
  });

  it('lists a show-scoped grant it cannot edit', async () => {
    mockUserRoleRows = [
      {
        id: 'ur-2',
        role_id: 'role-1',
        club_id: null,
        show_id: 'show-9',
        expires_at: null,
        roles: { name: 'judge' },
      },
    ];
    renderDialog();
    expect(await screen.findByText(/other grants/i)).toBeInTheDocument();
    // Plain-English copy: no raw show id shown to a non-technical admin.
    expect(screen.queryByText(/show-9/)).not.toBeInTheDocument();
    expect(screen.getByText(/for one show/i)).toBeInTheDocument();
  });

  it('lists an expiring grant it cannot edit', async () => {
    mockUserRoleRows = [
      {
        id: 'ur-3',
        role_id: 'role-1',
        club_id: 'club-1',
        show_id: null,
        expires_at: '2026-12-31T23:59:59Z',
        roles: { name: 'judge' },
      },
    ];
    renderDialog();
    expect(await screen.findByText(/other grants/i)).toBeInTheDocument();
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
  });

  it('points at the assignments ledger for grants it cannot edit', async () => {
    mockUserRoleRows = [
      {
        id: 'ur-4',
        role_id: 'role-1',
        club_id: null,
        show_id: 'show-9',
        expires_at: null,
        roles: { name: 'judge' },
      },
    ];
    renderDialog();
    await screen.findByText(/other grants/i);
    expect(screen.getByRole('link', { name: /assignments/i })).toHaveAttribute(
      'href',
      '/admin/permissions?tab=assignments'
    );
  });

  it('requests the show and expiry columns the other-grants block depends on', async () => {
    mockUserRoleRows = [
      {
        id: 'ur-5',
        role_id: 'role-1',
        club_id: 'club-1',
        show_id: null,
        expires_at: null,
        roles: { name: 'secretary' },
      },
    ];
    renderDialog();
    await screen.findByText(/manage roles/i);
    expect(capturedUserRolesSelect).toContain('show_id');
    expect(capturedUserRolesSelect).toContain('expires_at');
  });

  it('disables the checkbox for a role carrying a grant it cannot edit', async () => {
    mockUserRoleRows = [
      {
        id: 'ur-6',
        role_id: 'role-1',
        club_id: null,
        show_id: 'show-9',
        expires_at: null,
        roles: { name: 'judge' },
      },
    ];
    renderDialog();
    await screen.findByText(/other grants/i);
    const judgeCheckbox = screen.getByRole('checkbox', { name: /judge/i });
    expect(judgeCheckbox).toHaveAttribute('aria-disabled', 'true');
    // Two elements share this phrase (the label note and the section blurb) —
    // scope to the label's own note span so this stays specific to the checkbox.
    expect(
      screen.getByText(/managed on the assignments ledger/i, { selector: 'span' })
    ).toBeInTheDocument();
  });

  it('leaves a role with only ordinary grants enabled and toggleable', async () => {
    mockUserRoleRows = [
      {
        id: 'ur-7',
        role_id: 'role-1',
        club_id: 'club-1',
        show_id: null,
        expires_at: null,
        roles: { name: 'secretary' },
      },
    ];
    renderDialog();
    await screen.findByText(/manage roles/i);
    const secretaryCheckbox = await screen.findByRole('checkbox', { name: /secretary/i });
    expect(secretaryCheckbox).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(/managed on the assignments ledger/i)).not.toBeInTheDocument();
  });
});
