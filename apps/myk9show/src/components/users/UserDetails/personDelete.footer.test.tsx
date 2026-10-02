/**
 * Delete person in the Edit panel footer, with the STATIC gate and production React Query
 * defaults (refetchOnMount: true): each role's visibility, the plain refusal a secretary gets
 * on a stranger, and a dialog that never unmounts while its own preview refetches.
 */
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: mocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: mocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({ reconcileLocalDeletion: mocks.purge }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => false,
    hasContextPermission: () => false,
    hasPermission: () => false,
    getUserRoles: () => [],
    user: { id: 'viewer-auth' },
    userWithRoles: null,
  }),
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/components/users/ProfilePhotoDialog', () => ({ default: () => null }));
vi.mock('@/components/panels/edit', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/panels/edit')>()),
  JudgeQualificationPanel: () => null,
}));

import UserDetailsDialogs from './UserDetailsDialogs';
import { canDeletePerson } from './personDeleteGate';

const NOTHING = {
  trials: 0,
  classes: 0,
  entries: 0,
  shows: 0,
  dogs: 0,
  paid: 0,
  scored: 0,
  blocking: 0,
};
const person = {
  id: 'p1',
  user_id: 'auth-1',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.test',
} as unknown as User;
const noop = () => undefined;

function renderFooter(roles: UserRole[], authId: string, onPersonDeleted = vi.fn()) {
  // Production defaults: every new observer refetches on mount.
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  const rendered = render(
    <UserDetailsDialogs
      person={person}
      formData={{ name: 'Jane Smith', photo: '' }}
      canDelete={canDeletePerson(person, { id: authId, roles })}
      isEditModalOpen
      setIsEditModalOpen={noop}
      isPhotoModalOpen={false}
      setIsPhotoModalOpen={noop}
      isQualificationsPanelOpen={false}
      setIsQualificationsPanelOpen={noop}
      previewImage={null}
      setPreviewImage={noop}
      isDragging={false}
      onDrop={noop}
      onDragOver={noop}
      onDragLeave={noop}
      onPersonDeleted={onPersonDeleted}
      onUserEditSave={async () => undefined}
      onQualificationsSaved={noop}
      onPhotoSave={noop}
      onFileInput={noop}
    />,
    { wrapper }
  );
  return { ...rendered, user: userEvent.setup(), onPersonDeleted };
}

describe('Delete person in the Edit panel footer', () => {
  beforeEach(() => {
    mocks.preview.mockReset().mockResolvedValue(NOTHING);
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.purge.mockReset().mockResolvedValue(undefined);
  });

  it.each([
    ['a site admin', [UserRole.SITE_ADMIN], 'auth-9', true],
    ['the person themselves', [UserRole.EXHIBITOR], 'auth-1', true],
    ['a secretary', [UserRole.SECRETARY], 'auth-9', true],
    ['a club admin', [UserRole.CLUB_ADMIN], 'auth-9', true],
    ['another exhibitor', [UserRole.EXHIBITOR], 'auth-9', false],
    ['a judge', [UserRole.JUDGE], 'auth-9', false],
  ])('%s: visible is %s', async (_label, roles, authId, visible) => {
    renderFooter(roles, authId);
    // Positive control: the footer rendered.
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete person' }) !== null).toBe(visible);
  });

  it('tells a secretary on a stranger why, and offers no working Delete', async () => {
    mocks.preview.mockRejectedValue({ code: '42501', message: 'Permission denied' });
    const { user } = renderFooter([UserRole.SECRETARY], 'auth-9');

    await user.click(await screen.findByRole('button', { name: 'Delete person' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete the person Jane Smith?',
    });

    expect(
      await within(dialog).findByText(
        /You can only delete people who have entries in shows you manage, and your own account\./
      )
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete person' })).toBeDisabled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('keeps the dialog mounted while its own preview refetches, and completes the delete', async () => {
    const { user, onPersonDeleted } = renderFooter([UserRole.SECRETARY], 'auth-9');
    await user.click(await screen.findByRole('button', { name: 'Delete person' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete the person Jane Smith?',
    });

    const confirm = within(dialog).getByRole('button', { name: 'Delete person' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(screen.getByRole('alertdialog', { name: 'Delete the person Jane Smith?' })).toBe(dialog);
    await user.click(confirm);

    await waitFor(() => expect(onPersonDeleted).toHaveBeenCalledTimes(1));
    expect(mocks.remove).toHaveBeenCalledWith('person', 'p1', { override: false });
  });
});
