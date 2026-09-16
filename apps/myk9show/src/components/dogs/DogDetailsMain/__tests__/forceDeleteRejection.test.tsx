import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { Dog } from '@/types/dog-types';
import DogDialogs from '../DogDialogs';

/**
 * MYK9-595 companion to `pages/__tests__/DogDetailPage.forceDelete.test.tsx`.
 *
 * That test proves the PAGE survives a refused force delete; this one proves
 * the thing the page is protecting is worth protecting — against the real
 * `DogDialogs` -> `DeleteDogDialog` -> `ForceDeleteOverride` chain, a rejected
 * `onForceDelete` leaves the dialog mounted, the acknowledgement ticked, and
 * "Delete anyway" clickable again, so the admin can retry or read the error
 * without re-opening anything.
 */

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useDogActiveEntryCountQuery: () => ({ data: 3 }),
  // Non-zero: this is what makes the delete "blocked" and raises the override.
  useDogBlockingEntryCountQuery: () => ({ data: 1 }),
}));

vi.mock('@/components/panels/edit/DogEditPanel', () => ({
  DogEditPanel: () => null,
}));
vi.mock('@/components/common/PhotoDialog', () => ({ default: () => null }));

const dog = {
  id: 'dog-1',
  name: 'Champion Max',
  callName: 'Max',
  breed: 'Golden Retriever',
  sex: 'male',
  ownerId: 'person-1',
  registrations: [],
} as unknown as Dog;

const noop = () => {};

/**
 * Mirrors DogDetailsMain: the dialog is mounted only while its own state says
 * it is open, and `isDeleting` tracks the in-flight mutation.
 */
const Harness: React.FC<{ onForceDelete: () => Promise<void> }> = ({ onForceDelete }) => {
  const [open, setOpen] = React.useState(true);
  const [isDeleting, setIsDeleting] = React.useState(false);
  return (
    <DogDialogs
      dog={dog}
      isEditPanelOpen={false}
      isDeleteDialogOpen={open}
      isPhotoDialogOpen={false}
      photoPreview={null}
      isPhotoDragging={false}
      isSavingPhoto={false}
      showCelebration={false}
      userRole={UserRole.SITE_ADMIN}
      people={[]}
      isDeleting={isDeleting}
      canRestore
      canForceDelete
      onEditPanelClose={noop}
      onDeleteDialogClose={() => setOpen(false)}
      onForceDelete={async () => {
        setIsDeleting(true);
        try {
          await onForceDelete();
        } finally {
          setIsDeleting(false);
        }
      }}
      onPhotoDialogOpen={noop}
      onPhotoDrop={noop}
      onPhotoDragOver={noop}
      onPhotoDragLeave={noop}
      onPhotoFileInput={noop}
      onPhotoSave={async () => false}
      onSetUpdatedDog={noop}
      onSetShowCelebration={noop}
      onSetRecentUpdate={noop}
      onSetIsEditPanelOpen={noop}
    />
  );
};

describe('DogDialogs force-delete rejection (MYK9-595)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the dialog open, the acknowledgement ticked and the button usable after a refusal', async () => {
    let settle!: (reason: unknown) => void;
    const onForceDelete = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          settle = reject;
        })
    );

    const { user } = await act(async () => render(<Harness onForceDelete={onForceDelete} />));

    const acknowledgement = await screen.findByRole('checkbox', {
      name: /I understand — delete anyway/i,
    });
    await user.click(acknowledgement);

    const confirm = await screen.findByRole('button', { name: 'Delete anyway' });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(onForceDelete).toHaveBeenCalledTimes(1));

    await act(async () => {
      settle(Object.assign(new Error('Permission denied'), { code: '42501' }));
      await Promise.resolve();
    });

    // The dialog never closed: `onDeleteDialogClose` runs only after
    // `onForceDelete` RESOLVES, and BaseEntityDialog swallows the rejection.
    expect(await screen.findByRole('button', { name: 'Delete anyway' })).toBeInTheDocument();
    // The acknowledgement survives, so the admin does not re-read the friction
    // copy to retry...
    expect(screen.getByRole('checkbox', { name: /I understand — delete anyway/i })).toBeChecked();
    // ...and the button is usable again rather than stuck in its pending state.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete anyway' })).toBeEnabled()
    );
  });
});
