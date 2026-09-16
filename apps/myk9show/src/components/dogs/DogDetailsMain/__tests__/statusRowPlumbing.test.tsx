/**
 * The Status row lives in the Edit Dog panel, but its data and its handler come
 * from the dog-detail page through TWO hops: DogDetailsMain -> DogDialogs ->
 * DogEditPanel. `DogStatusRow.test.tsx` supplies `DogEditContext` directly, so
 * it cannot see either hop — deleting `dogStatus`/`onChangeStatus` from the
 * DogDialogs call makes the whole row vanish from the panel with every other
 * test still green. LESSONS #last-hop-drop.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import DogDialogs from '../DogDialogs';

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useDogActiveEntryCountQuery: () => ({ data: 0 }),
  useDogBlockingEntryCountQuery: () => ({ data: 0 }),
}));

vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));

const dog: Dog = {
  id: 'dog-1',
  name: 'Juniper',
  callName: 'Juni',
  breed: 'Border Collie',
  sex: 'female',
  ownerId: 'owner-1',
  status: 'retired',
};

function renderDialogs(props: Partial<React.ComponentProps<typeof DogDialogs>> = {}) {
  return render(
    <DogDialogs
      dog={dog}
      isEditPanelOpen
      isDeleteDialogOpen={false}
      isPhotoDialogOpen={false}
      photoPreview={null}
      isPhotoDragging={false}
      isSavingPhoto={false}
      showCelebration={false}
      userRole={UserRole.EXHIBITOR}
      people={[]}
      isDeleting={false}
      onEditPanelClose={() => {}}
      onDeleteDialogClose={() => {}}
      onPhotoDialogOpen={() => {}}
      onPhotoDrop={() => {}}
      onPhotoDragOver={() => {}}
      onPhotoDragLeave={() => {}}
      onPhotoFileInput={() => {}}
      onPhotoSave={async () => true}
      onSetUpdatedDog={() => {}}
      onSetShowCelebration={() => {}}
      onSetRecentUpdate={() => {}}
      onSetIsEditPanelOpen={() => {}}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Edit Dog panel Status row plumbing', () => {
  it("carries the dog's stored status into the panel and raises the dialog", async () => {
    const onStatusDialogOpen = vi.fn();
    renderDialogs({ onStatusDialogOpen });

    // The panel is lazy-loaded behind Suspense.
    const trigger = await waitFor(() => screen.getByRole('button', { name: /change status/i }));
    expect(screen.getByText('Retired')).toBeInTheDocument();

    trigger.click();
    expect(onStatusDialogOpen).toHaveBeenCalledTimes(1);
  });

  // The THIRD prop on this hop, and the only caller of `formatDisplayDate` for
  // a dog's date of passing: deleting `dogDeceasedDate` from the DogDialogs call
  // left every other test green, because `DogStatusRow`'s own suite feeds the
  // formatted string in through context.
  it('formats the date of passing on its way into the panel', async () => {
    renderDialogs({
      dog: { ...dog, status: 'deceased', deceasedDate: '2026-03-03' },
      onStatusDialogOpen: vi.fn(),
    });

    // `formatDisplayDate` renders M/D/YYYY, the same form the card's badge uses.
    await waitFor(() => expect(screen.getByText(/^Deceased/)).toBeInTheDocument());
    expect(screen.getByText('Deceased — 3/3/2026')).toBeInTheDocument();
  });

  it('hides the row when the page passes no handler, rather than showing a dead control', async () => {
    renderDialogs();

    await waitFor(() => expect(screen.getByLabelText(/call name/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /change status/i })).not.toBeInTheDocument();
  });
});
