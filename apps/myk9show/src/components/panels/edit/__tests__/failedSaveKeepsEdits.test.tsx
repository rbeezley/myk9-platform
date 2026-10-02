/**
 * "Your changes are still here" has to be true. A failed save must leave the
 * panel open showing what the user typed, even when the caller rolls back an
 * optimistic update that changes the panel's initial data (dog), and even when
 * the store used to swallow the failure (club).
 */
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import DogDialogs from '@/components/dogs/DogDetailsMain/DogDialogs';
import { ClubEditPanel } from '../ClubEditPanel';
import { useClubStore } from '@/store/clubStore';
import type { Dog } from '@/types/dog-types';
import type { Club } from '@/types/club-types';

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  updateClubRow: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedClubsTable: {
      ...actual.replicatedClubsTable,
      updateClub: mocks.updateClubRow,
      getAllClubs: vi.fn().mockResolvedValue([]),
    },
  };
});

const dog: Dog = fromAny({
  id: 'dog-1',
  callName: 'Ace',
  name: 'Ace',
  sex: 'male',
  gender: 'Male',
  birthDate: '2020-01-01',
  dateOfBirth: '2020-01-01',
  ownerId: 'person-1',
  registrations: [],
});

function DogHarness({ onUpdate }: { onUpdate: () => Promise<Dog | null> }) {
  const [current, setCurrent] = useState<Dog>(dog);
  const [open, setOpen] = useState(true);
  return (
    <DogDialogs
      dog={current}
      isEditPanelOpen={open}
      isDeleteDialogOpen={false}
      isPhotoDialogOpen={false}
      photoPreview={null}
      isPhotoDragging={false}
      isSavingPhoto={false}
      showCelebration={false}
      userRole={fromAny('admin')}
      people={[]}
      onEditPanelClose={() => setOpen(false)}
      onDeleteDialogClose={vi.fn()}
      onUpdate={onUpdate}
      onPhotoDialogOpen={vi.fn()}
      onPhotoDrop={vi.fn()}
      onPhotoDragOver={vi.fn()}
      onPhotoDragLeave={vi.fn()}
      onPhotoFileInput={vi.fn()}
      onPhotoSave={vi.fn()}
      onSetUpdatedDog={setCurrent}
      onSetShowCelebration={vi.fn()}
      onSetRecentUpdate={vi.fn()}
      onSetIsEditPanelOpen={setOpen}
    />
  );
}

describe('a failed save keeps the edits on screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dog: rolling back the optimistic update does not reset the form', async () => {
    const user = userEvent.setup();
    render(<DogHarness onUpdate={() => Promise.reject(new Error('boom'))} />);

    const name = await screen.findByLabelText(/call name/i);
    await user.clear(name);
    await user.type(name, 'Ace Jr');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /edit dog/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/call name/i)).toHaveValue('Ace Jr');
  });

  it('club: a store write that fails reports it and keeps the panel and edits', async () => {
    mocks.updateClubRow.mockRejectedValue(new Error('offline write failed'));
    const club: Club = fromAny({
      id: 'club-1',
      name: 'Heartland K9',
      description: '',
      email: 'club@example.com',
      phone: '555-123-4567',
      address: {
        street: '1 Main St',
        city: 'Austin',
        state: 'TX',
        zipCode: '75001',
        country: 'US',
      },
      clubType: 'local',
    });
    const user = userEvent.setup();
    render(
      <ClubEditPanel
        open
        onClose={vi.fn()}
        clubId="club-1"
        clubName="Heartland K9"
        initialClubData={club}
        onSave={async data => {
          await useClubStore.getState().updateClub({ ...club, ...data });
        }}
      />
    );

    const name = await screen.findByLabelText(/club name|^name/i);
    await user.clear(name);
    await user.type(name, 'Heartland K9 Club');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/club name|^name/i)).toHaveValue('Heartland K9 Club');
  });
});
