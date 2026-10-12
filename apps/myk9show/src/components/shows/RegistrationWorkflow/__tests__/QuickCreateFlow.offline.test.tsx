/**
 * MYK9-1081 §7.3: moving Person and Dog inside the one slide-out must not touch
 * the show-day save paths. Offline, the person queues first and the dog (with
 * its registrations) queues behind the person's pending mutations; online, the
 * same values go to the direct writes. The real forms render; only the
 * persistence seams are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useUserStore } from '@/store/userStore';
import { QuickCreateFlow } from '../QuickCreateFlow';
import {
  quickCreateMocks as mocks,
  resetQuickCreateMocks,
} from '@/test/quickCreate/quickCreateFlowMocks';
import {
  addPersonThroughForm,
  fillDogBasics,
  fillRegistration,
  JOURNEY_TIMEOUT_MS,
} from '@/test/quickCreate/quickCreateFlowKit';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  ...(await import('@/test/quickCreate/quickCreateFlowMocks')).usersModule,
}));
vi.mock(
  '@/services/replication/ReplicatedShowDeskPeopleTable',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).showDeskPeopleModule
);
vi.mock(
  '@/hooks/useDogStoreCompat',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).dogStoreModule
);
vi.mock(
  '../CreatedInSessionContext',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).createdInSessionModule
);
vi.mock(
  '@/components/ui/popover',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).popoverModule
);

beforeEach(() => {
  resetQuickCreateMocks();
  useUserStore.setState({ people: [], users: [] });
});

/** Person, then one dog carrying one registration, all through the real forms. */
async function createPersonAndDog(offlineFirst: boolean) {
  const { user } = render(
    <QuickCreateFlow
      open
      onOpenChange={vi.fn()}
      onFlowCompleted={vi.fn()}
      mode="batch"
      offlineFirst={offlineFirst}
      createdFromShowId="show-1"
    />
  );
  await addPersonThroughForm(user);
  await user.click(await screen.findByRole('button', { name: 'Add First Dog' }));
  await fillDogBasics(user);
  await user.click(screen.getByRole('button', { name: /Next: Registration/ }));
  await user.click(await screen.findByRole('button', { name: /Add New Registration/ }));
  await fillRegistration(user, 'DN1');
  await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
  await user.click(await screen.findByRole('button', { name: 'Add Dog' }));
}

describe('Quick Create save paths (§7.3)', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('offline: the dog and its registrations queue behind the person', async () => {
    await createPersonAndDog(true);

    await waitFor(() => expect(mocks.addDogOfflineFirst).toHaveBeenCalled());
    expect(mocks.createPerson).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Molly', createdFromShowId: 'show-1' })
    );
    expect(mocks.getPendingMutationIdsForRow).toHaveBeenCalledWith('person-1');
    expect(mocks.addDogOfflineFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'person-1',
        registrations: [expect.objectContaining({ number: 'DN1' })],
      }),
      { dependsOn: ['person-mutation-1'], createdFromShowId: 'show-1' }
    );
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.addDog).not.toHaveBeenCalled();
  });

  it('online: the same values go to the direct writes', async () => {
    await createPersonAndDog(false);

    await waitFor(() => expect(mocks.addDog).toHaveBeenCalled());
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Molly', created_from_show_id: 'show-1' })
    );
    expect(mocks.addDog).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'person-1',
        registrations: [expect.objectContaining({ number: 'DN1' })],
      }),
      { createdFromShowId: 'show-1' }
    );
    expect(mocks.createPerson).not.toHaveBeenCalled();
    expect(mocks.getPendingMutationIdsForRow).not.toHaveBeenCalled();
    expect(mocks.addDogOfflineFirst).not.toHaveBeenCalled();
  });
});
