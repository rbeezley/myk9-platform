/**
 * Every remaining delete entry point opens the ONE shared dialog, and nothing is
 * deleted until its Delete button is pressed. (The list rows, bulk bars, trial
 * and class surfaces have their own tests; these are the detail-page menus and
 * the person page's dog cards, which used to delete on a single click.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { Club } from '@/types/club-types';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('./deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('./deletePreview')>()),
  fetchDeletePreview: mocks.preview,
}));
// Nothing queued in these tests: the queue itself is covered by deleteUnsyncedWork's own test.
vi.mock('./deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('./deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('./deleteServer', () => ({ softDeleteOnServer: mocks.remove, restoreOnServer: vi.fn() }));
vi.mock('./deleteLocalState', () => ({ reconcileLocalDeletion: mocks.purge }));

// Heavy panels the dialogs sit beside; not under test here.
vi.mock('@/components/panels/edit/ClubEditPanel', () => ({ ClubEditPanel: () => null }));
vi.mock('@/components/clubs/ClubPhotoDialog', () => ({ default: () => null }));
vi.mock('@/components/clubs/members/AddMemberDialog', () => ({ AddMemberDialog: () => null }));
vi.mock('@/components/users/ProfilePhotoDialog', () => ({ default: () => null }));
vi.mock('@/components/panels/edit', () => ({
  UserEditPanel: () => null,
  JudgeQualificationPanel: () => null,
  AddDogPanel: () => null,
}));
vi.mock('@/components/panels/edit/DogEditPanel', () => ({ DogEditPanel: () => null }));
vi.mock('@/components/common/PhotoDialog', () => ({ default: () => null }));

const dogs: Dog[] = [
  {
    id: 'd1',
    name: 'Biscuit Registered',
    callName: 'Biscuit',
    breed: 'Beagle',
    sex: 'male',
    ownerId: 'p1',
    ownerName: 'Jane Smith',
    status: 'active',
  },
];
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs, updateDog: vi.fn() }),
}));

import { ClubDialogs } from '@/components/clubs/ClubDetails/ClubDialogs';
import UserDetailsDialogs from '@/components/users/UserDetails/UserDetailsDialogs';
import UserDetailsTabs from '@/components/users/UserDetails/UserDetailsTabs';
import DogDialogs from '@/components/dogs/DogDetailsMain/DogDialogs';

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

beforeEach(() => {
  mocks.preview.mockReset().mockResolvedValue(NOTHING);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.purge.mockReset().mockResolvedValue(undefined);
});

async function deleteThrough(
  user: ReturnType<typeof render>['user'],
  title: string,
  button: string
) {
  const dialog = await screen.findByRole('dialog', { name: title });
  expect(mocks.remove).not.toHaveBeenCalled();
  const confirm = within(dialog).getByRole('button', { name: button });
  await waitFor(() => expect(confirm).toBeEnabled());
  await user.click(confirm);
  return dialog;
}

const noop = () => undefined;

describe('club detail menu', () => {
  it('opens the shared dialog with the club and its city, and deletes on confirm', async () => {
    const onClubDeleted = vi.fn();
    const club = { id: 'k1', name: 'Heartland KC', city: 'Omaha' } as unknown as Club;
    const { user } = render(
      <ClubDialogs
        club={club}
        showEditPanel={false}
        onCloseEditPanel={noop}
        onSaveEdit={async () => undefined}
        showPhotoDialog={false}
        onPhotoDialogChange={noop}
        previewImage={null}
        isDragging={false}
        onPhotoDrop={noop}
        onPhotoDragOver={noop}
        onPhotoDragLeave={noop}
        onPhotoFileInput={noop}
        onPhotoCancel={noop}
        onPhotoSave={async () => undefined}
        showDeleteDialog
        onDeleteDialogChange={noop}
        onClubDeleted={onClubDeleted}
        showAddMemberDialog={false}
        onAddMemberDialogChange={noop}
        members={[]}
      />
    );

    const dialog = await deleteThrough(user, 'Delete the club Heartland KC?', 'Delete club');
    expect(within(dialog).getByText('Heartland KC · Omaha')).toBeVisible();
    await waitFor(() => expect(onClubDeleted).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledWith('club', 'k1', { override: false });
  });
});

describe('person detail menu', () => {
  it('opens the shared dialog for a live person, and deletes on confirm', async () => {
    const onPersonDeleted = vi.fn();
    const person = {
      id: 'p1',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.test',
    } as User;
    const { user } = render(
      <UserDetailsDialogs
        person={person}
        formData={{ name: 'Jane Smith', photo: '' }}
        canPermanentlyDelete={false}
        onPermanentDeleteUser={async () => undefined}
        isDeletingUser={false}
        isEditModalOpen={false}
        setIsEditModalOpen={noop}
        isPhotoModalOpen={false}
        setIsPhotoModalOpen={noop}
        isDeleteDialogOpen
        setIsDeleteDialogOpen={noop}
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

    const dialog = await deleteThrough(user, 'Delete the person Jane Smith?', 'Delete person');
    expect(within(dialog).getByText('jane@example.test')).toBeVisible();
    await waitFor(() => expect(onPersonDeleted).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledWith('person', 'p1', { override: false });
  });
});

describe('person page dog cards (used to delete on one click)', () => {
  it('asks through the shared dialog before deleting the dog', async () => {
    const selectedUser = {
      id: 'p1',
      firstName: 'Jane',
      lastName: 'Smith',
    } as unknown as Parameters<typeof UserDetailsTabs>[0]['selectedUser'];
    const { user } = render(<UserDetailsTabs selectedUser={selectedUser} />);

    await user.click(screen.getByRole('button', { name: 'Dog actions for Biscuit' }));
    await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));

    expect(mocks.remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Delete the dog Biscuit?' });
    expect(within(dialog).getByText('Biscuit · owned by Jane Smith')).toBeVisible();
    await deleteThrough(user, 'Delete the dog Biscuit?', 'Delete dog');
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith('dog', 'd1', { override: false })
    );
  });
});

describe('dog detail menu', () => {
  it('opens the shared dialog and reports start and success to the page', async () => {
    const onDeleteStart = vi.fn();
    const onDeleted = vi.fn();
    const { user } = render(
      <DogDialogs
        dog={dogs[0] as Dog}
        isEditPanelOpen={false}
        isDeleteDialogOpen
        isPhotoDialogOpen={false}
        photoPreview={null}
        isPhotoDragging={false}
        isSavingPhoto={false}
        showCelebration={false}
        userRole={UserRole.EXHIBITOR}
        people={[]}
        onEditPanelClose={noop}
        onDeleteDialogClose={noop}
        onDeleteStart={onDeleteStart}
        onDeleted={onDeleted}
        onPhotoDialogOpen={noop}
        onPhotoDrop={noop}
        onPhotoDragOver={noop}
        onPhotoDragLeave={noop}
        onPhotoFileInput={noop}
        onPhotoSave={async () => true}
        onSetUpdatedDog={noop}
        onSetShowCelebration={noop}
        onSetRecentUpdate={noop}
        onSetIsEditPanelOpen={noop}
      />
    );

    await deleteThrough(user, 'Delete the dog Biscuit?', 'Delete dog');
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('d1'));
    expect(onDeleteStart).toHaveBeenCalled();
  });
});
