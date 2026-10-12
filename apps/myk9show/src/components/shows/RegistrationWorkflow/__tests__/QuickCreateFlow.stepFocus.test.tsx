/**
 * MYK9-1081 review (P2): moving between steps or removing a dog unmounts the
 * control that was clicked. Focus must land on the destination's own control
 * inside the panel, never fall to <body> behind the aria-modal slide-out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
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
  JOURNEY_TIMEOUT_MS,
  panel,
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

type User = ReturnType<typeof render>['user'];
const button = (name: string | RegExp) => screen.getByRole('button', { name });
/** Effects, Base UI microtasks and SlideOverPanel's 300ms fallback all run first. */
const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 350)));

function renderFlow() {
  return render(
    <QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={vi.fn()} mode="batch" />
  );
}

async function addDog(user: User, callName: string) {
  await user.click(await screen.findByRole('button', { name: /Add (First|Another) Dog/ }));
  await fillDogBasics(user, callName);
  await user.click(button(/Next: Registration/));
  await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
  await user.click(await screen.findByRole('button', { name: 'Add Dog' }));
  // The steps screen is back once the add-dog control reads "Another".
  await screen.findByRole('button', { name: 'Add Another Dog' });
}

function expectFocusInPanelOn(element: HTMLElement) {
  expect(document.activeElement).not.toBe(document.body);
  expect(panel()).toContainElement(document.activeElement as HTMLElement);
  expect(element).toHaveFocus();
}

describe('focus on step changes within the step screens', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('footer Back from Dogs to Person lands on Edit Details', async () => {
    const { user } = renderFlow();
    await addPersonThroughForm(user);
    await screen.findByRole('heading', { name: 'Add Dog(s)' });

    await user.click(button('Back'));
    await settle();

    expectFocusInPanelOn(button('Edit Details'));
  });

  it('Next: Add Dogs lands on Add First Dog', async () => {
    const { user } = renderFlow();
    await addPersonThroughForm(user);
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: 'Next: Add Dogs' }));
    await settle();

    expectFocusInPanelOn(button('Add First Dog'));
  });

  it('Review lands on the Review & Complete heading', async () => {
    const { user } = renderFlow();
    await addPersonThroughForm(user);
    await addDog(user, 'Ziggy');

    await user.click(button('Review'));
    await settle();

    expectFocusInPanelOn(screen.getByRole('heading', { name: 'Review & Complete' }));
  });
});

describe('focus after removing a dog', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('removing the only dog lands on Add First Dog', async () => {
    const { user } = renderFlow();
    await addPersonThroughForm(user);
    await addDog(user, 'Ziggy');

    await user.click(button('Remove'));
    await settle();

    expectFocusInPanelOn(button('Add First Dog'));
  });

  it('removing a dog with another below lands on that row’s Remove', async () => {
    const dog = (id: string, callName: string) => ({
      id,
      name: callName,
      callName,
      gender: 'Male',
      dateOfBirth: '2020-01-01',
      registrations: [],
    });
    mocks.addDog
      .mockResolvedValueOnce(dog('dog-1', 'Ziggy'))
      .mockResolvedValueOnce(dog('dog-2', 'Rex'));
    const { user } = renderFlow();
    await addPersonThroughForm(user);
    await addDog(user, 'Ziggy');
    await addDog(user, 'Rex');

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0] as HTMLElement);
    await settle();

    expect(screen.getByText('Dogs Added (1):')).toBeInTheDocument();
    expectFocusInPanelOn(button('Remove'));
  });
});
