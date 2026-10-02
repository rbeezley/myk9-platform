/**
 * Staff delete a person through the footer Delete with PRODUCTION React Query
 * defaults (refetchOnMount: true). The gate's authorization read must not share
 * the dialog's `delete_preview` query: opening the dialog mounts a second
 * observer that refetches, and if that flipped the gate to false the panel would
 * drop `onDelete` and unmount the confirmation mid-flow.
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
    user: { id: 'staff-auth' },
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
import { useCanDeletePerson } from './useCanDeletePerson';

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

function Harness({ onPersonDeleted }: { onPersonDeleted: () => void }) {
  const canDelete = useCanDeletePerson(
    person,
    { id: 'staff-auth', roles: [UserRole.SECRETARY] },
    false
  );
  return (
    <UserDetailsDialogs
      person={person}
      formData={{ name: 'Jane Smith', photo: '' }}
      canDelete={canDelete}
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
    />
  );
}

describe('staff delete a person with production query defaults', () => {
  beforeEach(() => {
    mocks.preview.mockReset().mockResolvedValue(NOTHING);
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.purge.mockReset().mockResolvedValue(undefined);
  });

  it('keeps the confirmation mounted while the dialog refetches its own preview, and completes', async () => {
    // Production defaults: refetchOnMount stays true, so every new observer refetches.
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
    const onPersonDeleted = vi.fn();
    render(<Harness onPersonDeleted={onPersonDeleted} />, { wrapper });
    const user = userEvent.setup();

    // The gate resolved from the server's answer.
    const footerDelete = await screen.findByRole('button', { name: 'Delete person' });

    // From here the dialog's own preview read stays pending for a while, like a slow network.
    let release: (value: typeof NOTHING) => void = noop;
    mocks.preview.mockImplementation(
      () =>
        new Promise<typeof NOTHING>(resolve => {
          release = resolve;
        })
    );
    await user.click(footerDelete);
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete the person Jane Smith?',
    });

    // The authorization read is separate: the footer button and the dialog both survive.
    await waitFor(() => expect(mocks.preview).toHaveBeenCalled());
    expect(screen.getByRole('alertdialog', { name: 'Delete the person Jane Smith?' })).toBe(dialog);
    expect(
      screen.getAllByRole('button', { name: 'Delete person', hidden: true }).length
    ).toBeGreaterThanOrEqual(2);

    release(NOTHING);
    const confirm = within(dialog).getByRole('button', { name: 'Delete person' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(screen.getByRole('alertdialog', { name: 'Delete the person Jane Smith?' })).toBe(dialog);
    await user.click(confirm);

    await waitFor(() => expect(onPersonDeleted).toHaveBeenCalledTimes(1));
    expect(mocks.remove).toHaveBeenCalledWith('person', 'p1', { override: false });
  });
});
