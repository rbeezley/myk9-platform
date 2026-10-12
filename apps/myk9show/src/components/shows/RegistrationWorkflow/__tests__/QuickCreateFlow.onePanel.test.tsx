/**
 * MYK9-1081: Quick Create is ONE right slide-out. Add Person, Add Dog and the
 * registration form inside Add Dog are views of that one panel, never a dialog
 * or a second slide-out stacked on it (docs/INTENT.md, "Dialog or Slide-Out").
 * The real Person and Dog forms render; only the persistence seams are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useUserStore } from '@/store/userStore';
import { QuickCreateFlow } from '../QuickCreateFlow';
import {
  quickCreateMocks as mocks,
  resetQuickCreateMocks,
} from '@/test/quickCreate/quickCreateFlowMocks';
import {
  addPersonThroughForm,
  dialogs,
  fillDogBasics,
  fillRegistration,
  panel,
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

function renderFlow(onFlowCompleted = vi.fn(), onOpenChange = vi.fn()) {
  return render(
    <QuickCreateFlow
      open
      onOpenChange={onOpenChange}
      onFlowCompleted={onFlowCompleted}
      mode="batch"
    />
  );
}

describe('Quick Create is one slide-out (T1)', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('keeps Person, Dog and the registration form inside the same single panel', async () => {
    const { user } = renderFlow();

    // 1. On open: one modal surface, and it is the slide-out.
    await screen.findByLabelText(/First Name/i);
    expect(dialogs()).toHaveLength(1);
    expect(panel()).not.toBeNull();
    const host = dialogs()[0] as HTMLElement;
    expect(host).toContainElement(panel() as HTMLElement);
    expect(within(host).getByText('Step 1 of 3: Add Person')).toBeInTheDocument();
    expect(within(host).getByLabelText(/First Name/i)).toBeInTheDocument();

    // 2. Add Person saves: the same host now shows the Dogs step.
    await addPersonThroughForm(user);
    expect(await within(host).findByRole('heading', { name: 'Add Dog(s)' })).toBeInTheDocument();
    expect(dialogs()[0]).toBe(host);

    // 3. Add First Dog: the dog form renders in the same host.
    await user.click(within(host).getByRole('button', { name: 'Add First Dog' }));
    expect(await within(host).findByLabelText(/Call Name/i)).toBeInTheDocument();
    expect(dialogs()[0]).toBe(host);

    // 4. Registration tab, then Add New Registration: still one surface (2 before).
    await fillDogBasics(user, 'Ziggy');
    await user.click(within(host).getByRole('tab', { name: /Registration/ }));
    await user.click(await within(host).findByRole('button', { name: /Add New Registration/ }));
    expect(await within(host).findByLabelText(/Registered Name/i)).toBeInTheDocument();
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0]).toBe(host);

    // 5. Save Registration: the dog form comes back with what was typed.
    await fillRegistration(user);
    await waitFor(() => expect(within(host).getByText('Mailbox Special Delivery')).toBeVisible());
    expect(screen.queryByRole('dialog', { name: /registration/i })).toBeNull();
    await user.click(within(host).getByRole('tab', { name: /Essential/ }));
    expect(within(host).getByLabelText(/Call Name/i)).toHaveValue('Ziggy');
    expect(dialogs()).toHaveLength(1);
  });
});

describe('Complete Setup is unchanged (T3)', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('hands the saved person and dog to onFlowCompleted and closes', async () => {
    const onFlowCompleted = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = renderFlow(onFlowCompleted, onOpenChange);

    await addPersonThroughForm(user);
    await user.click(await screen.findByRole('button', { name: 'Add First Dog' }));
    await fillDogBasics(user);
    await user.click(screen.getByRole('button', { name: /Next: Registration/ }));
    await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Dog' }));

    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await user.click(await screen.findByRole('button', { name: 'Complete Setup' }));

    expect(onFlowCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'person-1', dogs: ['dog-1'] }),
      [expect.objectContaining({ id: 'dog-1' })]
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.recordOwnerCreated).toHaveBeenCalledTimes(1);
    expect(mocks.recordDogCreated).toHaveBeenCalledTimes(1);
  });
});
