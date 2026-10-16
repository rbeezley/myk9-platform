/**
 * MYK9-1111: choosing "Use This Person" in Quick Create's possible-duplicate
 * prompt must continue with that EXISTING person: same id, no create call, and
 * not recorded as created this session. The real QuickCreateFlow and the real
 * Person form render; only persistence and the Add Dog form are faked (Add Dog
 * is stubbed to expose the owner it was handed).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps } from '@/components/panels/edit/AddDogPanel/types';
import { useUserStore } from '@/store/userStore';
import { QuickCreateFlow } from '../QuickCreateFlow';
import {
  quickCreateMocks as mocks,
  resetQuickCreateMocks,
} from '@/test/quickCreate/quickCreateFlowMocks';
import { JOURNEY_TIMEOUT_MS } from '@/test/quickCreate/quickCreateFlowKit';

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
  '../CreatedInSessionContext',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).createdInSessionModule
);

const dogPanel = vi.hoisted(() => ({ props: undefined as unknown }));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: AddDogPanelProps) => {
    dogPanel.props = props;
    return props.open ? (
      <button
        type="button"
        onClick={() =>
          props.onDogCreated({ id: 'dog-1', name: 'Ziggy', callName: 'Ziggy' } as never)
        }
      >
        Stub Save Dog
      </button>
    ) : null;
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

/** Types an identity as one paste per field, then leaves Basic Info. */
async function enterIdentity(
  user: ReturnType<typeof render>['user'],
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

function renderFlow(offlineFirst: boolean, onFlowCompleted = vi.fn()) {
  const rendered = render(
    <QuickCreateFlow
      open
      onOpenChange={vi.fn()}
      onFlowCompleted={onFlowCompleted}
      mode="batch"
      offlineFirst={offlineFirst}
      createdFromShowId="show-1"
    />
  );
  return { ...rendered, onFlowCompleted };
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
  'Quick Create duplicate selection ($label)',
  { timeout: JOURNEY_TIMEOUT_MS },
  ({ offlineFirst }) => {
    it('Use This Person continues to Dogs with the original person id and creates nobody', async () => {
      const { user, onFlowCompleted } = renderFlow(offlineFirst);
      await enterIdentity(user, 'Molly', 'Mailbox', 'molly@example.test');
      await user.click(await screen.findByRole('button', { name: 'Use This Person' }));

      // Back on the steps screen at Dogs, for the existing person.
      await user.click(await screen.findByRole('button', { name: 'Add First Dog' }));
      expect(dogPanel.props).toEqual(
        expect.objectContaining({
          currentUserPersonId: 'person-existing-1',
          userRole: UserRole.SECRETARY,
          // Offline, the dog queues behind any still-pending write for this person.
          offlineDependsOn: offlineFirst ? ['person-mutation-1'] : [],
        })
      );
      if (offlineFirst) {
        expect(mocks.getPendingMutationIdsForRow).toHaveBeenCalledWith('person-existing-1');
      } else {
        expect(mocks.getPendingMutationIdsForRow).not.toHaveBeenCalled();
      }

      await user.click(await screen.findByRole('button', { name: 'Stub Save Dog' }));
      await user.click(await screen.findByRole('button', { name: 'Review' }));
      await user.click(await screen.findByRole('button', { name: 'Complete Setup' }));

      expect(onFlowCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'person-existing-1', dogs: ['dog-1'] }),
        [expect.objectContaining({ id: 'dog-1' })]
      );
      expect(mocks.createUser).not.toHaveBeenCalled();
      expect(mocks.createPerson).not.toHaveBeenCalled();
      // An existing person is not "created this session" (that list drives the leave prompt).
      expect(mocks.recordOwnerCreated).not.toHaveBeenCalled();
    });

    it('a person who matches nobody is still created', async () => {
      const { user } = renderFlow(offlineFirst);
      await enterIdentity(user, 'Nora', 'Newcomer', 'nora@example.test');
      await user.click(await screen.findByRole('button', { name: 'Add Person' }));

      await screen.findByRole('button', { name: 'Add First Dog' });
      const create = offlineFirst ? mocks.createPerson : mocks.createUser;
      expect(create).toHaveBeenCalledTimes(1);
      expect(mocks.recordOwnerCreated).toHaveBeenCalledTimes(1);
    });

    it('Add Person Anyway still creates a new person', async () => {
      const { user } = renderFlow(offlineFirst);
      await enterIdentity(user, 'Molly', 'Mailbox', 'molly@example.test');
      await user.click(await screen.findByRole('button', { name: 'Add Person Anyway' }));
      await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
      await user.click(await screen.findByRole('button', { name: 'Add Person' }));

      await waitFor(() => expect(mocks.recordOwnerCreated).toHaveBeenCalledTimes(1));
      const create = offlineFirst ? mocks.createPerson : mocks.createUser;
      expect(create).toHaveBeenCalledTimes(1);
    });
  }
);
