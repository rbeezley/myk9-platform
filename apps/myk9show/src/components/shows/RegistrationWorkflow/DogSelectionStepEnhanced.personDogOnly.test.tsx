/**
 * MYK9-1081 (PR B): the wizard's "Create New → Exhibitor Only" and "→ Dog Only"
 * are right slide-outs opened from the page, never a centred dialog
 * (docs/INTENT.md, "Dialog or Slide-Out"). Rendered the way the wizard mounts
 * this step (`WorkflowStepContent` only mounts it with `advancedSearch`), with
 * the real Base UI menu, Person form and Dog form; only persistence is mocked.
 *
 * - Each slide-out takes focus, even though the menu hands focus back to its
 *   "Create New" trigger as it closes (aria-modal: focus behind is a trap).
 * - After Exhibitor Only saves, Add Dog opens for THAT person, and only once the
 *   person slide-out has left the screen: one slide-out at any moment.
 * - Closing returns focus to "Create New", never to <body>.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { useUserStore } from '@/store/userStore';
import {
  quickCreateMocks as mocks,
  resetQuickCreateMocks,
} from '@/test/quickCreate/quickCreateFlowMocks';
import {
  addPersonThroughForm,
  dialogs,
  fillDogBasics,
  JOURNEY_TIMEOUT_MS,
  panel,
} from '@/test/quickCreate/quickCreateFlowKit';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';

const listed = vi.hoisted(() => ({ dogs: [] as unknown[] }));

vi.mock('@/hooks/useDogStoreCompat', async () => {
  const { dogStoreModule } = await import('@/test/quickCreate/quickCreateFlowMocks');
  return {
    useDogStoreCompat: () => ({ ...dogStoreModule.useDogStoreCompat(), dogs: listed.dogs }),
  };
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
vi.mock('@/services/database/dogs', () => ({ SEARCH_ALL_DOGS_LIMIT: 25, searchAllDogs: vi.fn() }));
vi.mock(
  './CreatedInSessionContext',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).createdInSessionModule
);

const ACE = {
  id: 'dog-ace',
  name: 'Ace',
  callName: 'Ace',
  ownerId: 'user-1',
  status: 'active',
  registrations: [{ organization: 'AKC', registrationNumber: 'SW123', breed: 'Golden Retriever' }],
};

/** Past SlideOverPanel's 300ms open/close animation and its focus ticks. */
const settle = () => new Promise(resolve => setTimeout(resolve, 450));

/** The most `[role="dialog"]` elements seen at once while `run` executes. */
async function peakDialogs(run: () => Promise<void>) {
  let peak = dialogs().length;
  const observer = new MutationObserver(() => {
    peak = Math.max(peak, dialogs().length);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  try {
    await run();
  } finally {
    observer.disconnect();
  }
  return Math.max(peak, dialogs().length);
}

function renderStep() {
  const rendered = render(
    <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
  );
  const createNew = screen.getByRole('button', { name: /Create New/ });
  return { ...rendered, createNew };
}

beforeEach(() => {
  resetQuickCreateMocks();
  listed.dogs = [ACE];
  useUserStore.setState({ people: [], users: [] });
});

afterEach(() => {
  listed.dogs = [];
});

describe('Create New → Dog Only', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('opens Add Dog as a slide-out that holds focus, and gives it back on close', async () => {
    const { user, createNew } = renderStep();

    await user.click(createNew);
    await user.click(await screen.findByRole('menuitem', { name: /Dog Only/ }));
    await screen.findByLabelText(/Call Name/i);
    await settle();

    expect(dialogs()).toHaveLength(1);
    const slideOut = panel() as HTMLElement;
    expect(within(slideOut).getByLabelText(/Call Name/i)).toBeInTheDocument();
    expect(slideOut).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialogs()).toHaveLength(0), { timeout: 2000 });
    await settle();
    expect(document.activeElement).toBe(createNew);
  });
});

describe('Create New → Exhibitor Only', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('hands over to one Add Dog slide-out for that person; focus stays modal and returns to Create New', async () => {
    const { user, createNew } = renderStep();

    await user.click(createNew);
    await user.click(await screen.findByRole('menuitem', { name: /Exhibitor Only/ }));
    await screen.findByLabelText(/First Name/i);
    await settle();
    expect(dialogs()).toHaveLength(1);
    expect(within(panel() as HTMLElement).getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(panel()).toContainElement(document.activeElement as HTMLElement);

    const peak = await peakDialogs(async () => {
      await addPersonThroughForm(user);
      await waitFor(() => expect(screen.getByLabelText(/Call Name/i)).toBeInTheDocument(), {
        timeout: 3000,
      });
      await settle();
    });

    // The person panel left before the dog panel arrived: never two at once.
    expect(peak).toBe(1);
    expect(dialogs()).toHaveLength(1);
    expect(screen.queryByLabelText(/First Name/i)).toBeNull();
    expect(panel()).toContainElement(document.activeElement as HTMLElement);

    // Add Dog belongs to the person just created.
    await fillDogBasics(user);
    await user.click(screen.getByRole('button', { name: /Next: Registration/ }));
    await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Dog' }));
    await waitFor(() =>
      expect(mocks.addDog).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'person-1' }),
        expect.anything()
      )
    );

    await waitFor(() => expect(dialogs()).toHaveLength(0), { timeout: 2000 });
    await settle();
    expect(document.activeElement).toBe(createNew);
  });
});
