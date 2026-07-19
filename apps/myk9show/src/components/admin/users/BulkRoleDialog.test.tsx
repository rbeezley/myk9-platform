/**
 * Unit tests for BulkRoleDialog — canonical role vocabulary, locked-role handling
 * per mode, and the club-required-before-submit guard (design.md "Bulk dialog
 * semantics"). Club-scoped dispatch (clubId carried through) is covered end-to-end
 * in useBulkActions.test.ts; this file focuses on the dialog's own gating.
 *
 * Uses `getByRole('checkbox', { name })` rather than `getByLabelText` — Base UI's
 * Checkbox renders a visible `role="checkbox"` element AND a hidden native
 * `<input>` sharing the label's `aria-labelledby`/`for`, so `getByLabelText`
 * (which matches on any labelled element) resolves to two nodes.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import { BulkRoleDialog } from './BulkRoleDialog';

const clubsQueryMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          order: vi.fn(() => clubsQueryMock()),
        })),
      })),
    })),
  },
}));

function selectedUser(id: string, firstName: string): SelectedUser {
  return {
    id,
    user: {
      id,
      firstName,
      lastName: 'Test',
      email: `${id}@example.com`,
      roles: [UserRole.EXHIBITOR],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof BulkRoleDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSubmit = overrides.onSubmit ?? vi.fn();
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  const props: React.ComponentProps<typeof BulkRoleDialog> = {
    open: true,
    onOpenChange,
    selectedUsers: [selectedUser('u1', 'Alice')],
    isProcessing: false,
    error: null,
    onSubmit,
    ...overrides,
  };
  render(
    <QueryClientProvider client={client}>
      <BulkRoleDialog {...props} />
    </QueryClientProvider>
  );
  return { onSubmit, onOpenChange };
}

describe('BulkRoleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clubsQueryMock.mockResolvedValue({
      data: [
        { id: 'club-1', name: 'Alpha Club' },
        { id: 'club-2', name: 'Beta Club' },
      ],
      error: null,
    });
  });

  it('renders exactly the canonical manageable role list — no admin/handler', () => {
    renderDialog();

    expect(screen.getByRole('checkbox', { name: /Site Admin/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Secretary$/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Club Admin/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Judge$/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Exhibitor/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Steward/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Chairman/ })).toBeInTheDocument();

    expect(screen.queryByRole('checkbox', { name: /^Admin$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Handler/ })).not.toBeInTheDocument();
  });

  it('shows exhibitor as always-assigned and disabled in Add mode', () => {
    renderDialog();

    const exhibitorCheckbox = screen.getByRole('checkbox', { name: /Exhibitor/ });
    expect(exhibitorCheckbox).toHaveAttribute('aria-disabled', 'true');
    expect(exhibitorCheckbox).toHaveAttribute('aria-checked', 'true');
  });

  it('hides exhibitor entirely in Remove mode (locked roles are never offered for removal)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Remove' }));

    expect(screen.queryByRole('checkbox', { name: /Exhibitor/ })).not.toBeInTheDocument();
  });

  it('blocks submit when a club-scoped role is selected without a club', async () => {
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('checkbox', { name: /^Secretary$/ }));
    // Wait for the clubs query to settle — Apply is disabled while it loads.
    expect(await screen.findByText(/add a club/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/select at least one club/i)).toBeInTheDocument();
  });

  it('blocks submit when no role is selected', () => {
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/select at least one role/i)).toBeInTheDocument();
  });

  it('submits an unscoped role add with no clubs required', () => {
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('checkbox', { name: /^Judge$/ }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: 'add',
      roleNames: ['judge'],
      clubIds: [],
    });
  });

  it('shows a retryable error and disables Apply when the clubs query fails and a scoped role is selected', async () => {
    clubsQueryMock.mockRejectedValue(new Error('network down'));
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('checkbox', { name: /^Secretary$/ }));

    // Retryable error state instead of the misleading "select at least one club".
    expect(await screen.findByText(/could not load clubs/i)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    // Apply is disabled — nothing can be submitted while clubs are unavailable.
    const applyButton = screen.getByRole('button', { name: /apply/i });
    expect(applyButton).toBeDisabled();
    fireEvent.click(applyButton);
    expect(onSubmit).not.toHaveBeenCalled();

    // Retry refetches; once clubs load, the picker appears and Apply re-enables.
    clubsQueryMock.mockResolvedValue({
      data: [{ id: 'club-1', name: 'Alpha Club' }],
      error: null,
    });
    fireEvent.click(retryButton);
    expect(await screen.findByText(/add a club/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled();
  });

  it('still submits an unscoped role when the clubs query fails (clubs are irrelevant)', async () => {
    clubsQueryMock.mockRejectedValue(new Error('network down'));
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('checkbox', { name: /^Judge$/ }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    expect(onSubmit).toHaveBeenCalledWith({ mode: 'add', roleNames: ['judge'], clubIds: [] });
  });
});
