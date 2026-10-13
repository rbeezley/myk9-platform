import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { QuickCreateSteps } from '../QuickCreateSteps';
import { INITIAL_QUICK_CREATE_FLOW_STATE } from '../QuickCreateFlow.types';
import type { Dog, User } from '@/types/dog-types';

// A dog made in this flow is the secretary's to fix (dogs_update's created-by and
// created-from-show arms); an existing dog picked from the duplicate prompt is the owner's
// record until it is entered, so Edit asks the server first instead of offering a save it
// refuses (2026-10-12).
const rpc = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

const madeHere: Dog = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Made Here',
  callName: 'Made',
  breed: 'Poodle',
  sex: 'female',
  ownerId: 'owner-1',
  status: 'active',
};
const picked: Dog = { ...madeHere, id: 'aaaaaaaa-0000-4000-8000-000000000002', callName: 'Picked' };
const exhibitor = { id: 'owner-1', firstName: 'Debbie', lastName: 'Owner' } as User;

function setup(existingDogIds: ReadonlySet<string>) {
  return render(
    <QuickCreateSteps
      flowState={{
        ...INITIAL_QUICK_CREATE_FLOW_STATE,
        step: 'dogs',
        exhibitor,
        dogs: [madeHere, picked],
      }}
      mode="batch"
      onOpenPersonForm={vi.fn()}
      onEditPerson={vi.fn()}
      onOpenDogForm={vi.fn()}
      existingDogIds={existingDogIds}
      onEditDog={vi.fn()}
      onRemoveDog={vi.fn()}
    />
  );
}

const rowFor = (callName: string) => screen.getByText(callName).closest('.border') as HTMLElement;

describe('QuickCreateSteps — dog Edit follows dogs_update', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('offers Edit on a dog made in this flow without asking, and not on an owner-held one', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    setup(new Set([picked.id]));

    await waitFor(() =>
      expect(within(rowFor('Picked')).queryByRole('button', { name: 'Edit' })).toBeNull()
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('can_edit_dog', { p_dog_id: picked.id });
    expect(within(rowFor('Made')).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    // Remove stays: taking the dog out of this entry is not an edit of the dog.
    expect(within(rowFor('Picked')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('keeps Edit on a picked dog the server lets this secretary change', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    setup(new Set([picked.id]));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(within(rowFor('Picked')).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
