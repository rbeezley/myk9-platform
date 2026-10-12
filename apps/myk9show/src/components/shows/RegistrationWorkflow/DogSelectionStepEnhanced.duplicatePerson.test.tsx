/**
 * MYK9-1111: Create New → Exhibitor Only. "Use This Person" in the duplicate
 * prompt hands Add Dog the EXISTING person (same id, no create call, not
 * recorded as created this session); a non-match and "Add Person Anyway" still
 * create. Real step, menu and Person form; persistence is faked and Add Dog is
 * stubbed to expose the owner and queue dependencies it was handed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps } from '@/components/panels/edit/AddDogPanel/types';
import { useUserStore } from '@/store/userStore';
import {
  quickCreateMocks as mocks,
  resetQuickCreateMocks,
} from '@/test/quickCreate/quickCreateFlowMocks';
import { JOURNEY_TIMEOUT_MS } from '@/test/quickCreate/quickCreateFlowKit';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';

vi.mock('@/hooks/useDogStoreCompat', async () => {
  const { dogStoreModule } = await import('@/test/quickCreate/quickCreateFlowMocks');
  // One stable array: a fresh `dogs` every render loops the step's effects.
  const dogs: unknown[] = [];
  return { useDogStoreCompat: () => ({ ...dogStoreModule.useDogStoreCompat(), dogs }) };
});
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    user: { id: 'u1' },
    roles: [UserRole.SECRETARY],
    canBulkOperations: true,
    canCreateExhibitor: true,
    getMaxDogsPerRegistration: () => 50,
  }),
}));
vi.mock('@/hooks/useRegistrationContext', () => ({
  useRegistrationContext: () => ({
    workflowConfig: { features: { advancedSearch: true, createNew: true } },
  }),
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
vi.mock('@/services/database/dogs', () => ({ SEARCH_ALL_DOGS_LIMIT: 25, searchAllDogs: vi.fn() }));
vi.mock(
  './CreatedInSessionContext',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).createdInSessionModule
);

const dogPanel = vi.hoisted(() => ({ props: undefined as unknown }));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: AddDogPanelProps) => {
    dogPanel.props = props;
    return props.open ? <div data-testid="stub-add-dog" /> : null;
  },
}));

const EXISTING = {
  id: 'person-existing-1',
  firstName: 'Molly',
  lastName: 'Mailbox',
  email: 'molly@example.test',
  phone: '',
  dogs: [],
};

async function openExhibitorOnly(offlineFirst: boolean) {
  const rendered = render(
    <DogSelectionStepEnhanced
      selectedDogs={[]}
      onSelectionChange={vi.fn()}
      offlineFirst={offlineFirst}
    />
  );
  const { user } = rendered;
  await user.click(screen.getByRole('button', { name: /Create New/ }));
  await user.click(await screen.findByRole('menuitem', { name: /Exhibitor Only/ }));
  return rendered;
}

async function enterIdentity(
  user: Awaited<ReturnType<typeof openExhibitorOnly>>['user'],
  first: string,
  last: string,
  email: string
) {
  for (const [label, value] of [
    [/First Name/i, first],
    [/Last Name/i, last],
    [/Email Address/i, email],
  ] as const) {
    await user.click(await screen.findByLabelText(label));
    await user.paste(value);
  }
  await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
}

beforeEach(() => {
  resetQuickCreateMocks();
  dogPanel.props = undefined;
  useUserStore.setState({ people: [EXISTING], users: [EXISTING] } as never);
});

describe.each([
  { offlineFirst: false, label: 'online' },
  { offlineFirst: true, label: 'offline-first' },
])(
  'Add Person Only duplicate selection ($label)',
  { timeout: JOURNEY_TIMEOUT_MS },
  ({ offlineFirst }) => {
    it('Use This Person opens Add Dog for the existing person and creates nobody', async () => {
      const { user } = await openExhibitorOnly(offlineFirst);
      await enterIdentity(user, 'Molly', 'Mailbox', 'molly@example.test');
      await user.click(await screen.findByRole('button', { name: 'Use This Person' }));

      await screen.findByTestId('stub-add-dog', undefined, { timeout: 3000 });
      expect(dogPanel.props).toEqual(
        expect.objectContaining({
          open: true,
          currentUserPersonId: 'person-existing-1',
          offlineDependsOn: offlineFirst ? ['person-mutation-1'] : [],
        })
      );
      if (offlineFirst) {
        expect(mocks.getPendingMutationIdsForRow).toHaveBeenCalledWith('person-existing-1');
      } else {
        expect(mocks.getPendingMutationIdsForRow).not.toHaveBeenCalled();
      }
      expect(mocks.createUser).not.toHaveBeenCalled();
      expect(mocks.createPerson).not.toHaveBeenCalled();
      expect(mocks.recordOwnerCreated).not.toHaveBeenCalled();
    });

    it('a person who matches nobody is still created and recorded', async () => {
      const { user } = await openExhibitorOnly(offlineFirst);
      await enterIdentity(user, 'Nora', 'Newcomer', 'nora@example.test');
      await user.click(await screen.findByRole('button', { name: 'Add Person' }));

      await screen.findByTestId('stub-add-dog', undefined, { timeout: 3000 });
      expect(dogPanel.props).toEqual(expect.objectContaining({ currentUserPersonId: 'person-1' }));
      expect(offlineFirst ? mocks.createPerson : mocks.createUser).toHaveBeenCalledTimes(1);
      expect(mocks.recordOwnerCreated).toHaveBeenCalledTimes(1);
    });

    it('Add Person Anyway still creates a new person', async () => {
      const { user } = await openExhibitorOnly(offlineFirst);
      await enterIdentity(user, 'Molly', 'Mailbox', 'molly@example.test');
      await user.click(await screen.findByRole('button', { name: 'Add Person Anyway' }));
      await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
      await user.click(await screen.findByRole('button', { name: 'Add Person' }));

      await waitFor(() => expect(mocks.recordOwnerCreated).toHaveBeenCalledTimes(1));
      expect(offlineFirst ? mocks.createPerson : mocks.createUser).toHaveBeenCalledTimes(1);
    });
  }
);
