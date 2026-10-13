/**
 * An existing dog picked from Add Dog's duplicate prompt is the owner's record until it is
 * entered, so the flow must hand it to the Edit gate as NOT made here (knownAllowed false),
 * and the gate's server answer decides (2026-10-12). The add panel is stubbed down to that
 * one emission; QuickCreateSteps.editGate.test.tsx covers the gate itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useUserStore } from '@/store/userStore';
import { QuickCreateFlow } from '../QuickCreateFlow';
import { resetQuickCreateMocks } from '@/test/quickCreate/quickCreateFlowMocks';
import { addPersonThroughForm, JOURNEY_TIMEOUT_MS } from '@/test/quickCreate/quickCreateFlowKit';
import type { Dog } from '@/types/dog-types';

const pickedDog: Dog = {
  id: 'bbbbbbbb-0000-4000-8000-000000000001',
  name: 'Liddle',
  callName: 'Liddle',
  breed: 'Poodle',
  sex: 'female',
  ownerId: 'owner-elsewhere',
  status: 'active',
};

const serverSays = vi.fn<(dogId: string) => boolean>();
vi.mock('@/hooks/queries/useCanEditDog', () => ({
  useCanEditDog: (dogId: string, knownAllowed: boolean) => knownAllowed || serverSays(dogId),
}));
vi.mock('@/components/panels/edit', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/panels/edit')>()),
  AddDogPanel: (props: { onDogCreated: (dog: Dog, options?: { existing?: boolean }) => void }) => (
    <button type="button" onClick={() => props.onDogCreated(pickedDog, { existing: true })}>
      Use existing Liddle
    </button>
  ),
}));
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
  serverSays.mockReset();
  useUserStore.setState({ people: [], users: [] });
});

async function pickExistingDog() {
  const { user } = render(
    <QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={vi.fn()} mode="batch" />
  );
  await addPersonThroughForm(user);
  await user.click(await screen.findByRole('button', { name: 'Add First Dog' }));
  await user.click(await screen.findByRole('button', { name: 'Use existing Liddle' }));
  await screen.findByText('Dogs Added (1):');
}

describe(
  'Quick Create — an existing dog picked from the duplicate prompt',
  { timeout: JOURNEY_TIMEOUT_MS },
  () => {
    it('is not offered Edit when the server says it is the owner’s to change', async () => {
      serverSays.mockReturnValue(false);
      await pickExistingDog();

      expect(serverSays).toHaveBeenCalledWith(pickedDog.id);
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('is offered Edit when the server lets this secretary change it', async () => {
      serverSays.mockReturnValue(true);
      await pickExistingDog();

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
  }
);
