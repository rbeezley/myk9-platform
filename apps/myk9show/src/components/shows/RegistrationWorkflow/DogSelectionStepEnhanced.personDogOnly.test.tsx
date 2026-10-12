/**
 * MYK9-1081 (PR B): the wizard's "Add Person Only" and "Dog Only" are right
 * slide-outs opened from the page, never a centred dialog (docs/INTENT.md,
 * "Dialog or Slide-Out"). After Add Person Only saves, Add Dog opens for that
 * person, and the person panel has fully left before it does: one slide-out on
 * screen at any moment. The real Person and Dog forms render; only the
 * persistence seams are mocked.
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
    workflowConfig: { features: { advancedSearch: false, createNew: true } },
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

beforeEach(() => {
  resetQuickCreateMocks();
  listed.dogs = [];
  useUserStore.setState({ people: [], users: [] });
});

afterEach(() => {
  listed.dogs = [];
});

describe('DogSelectionStepEnhanced Add Person Only', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('opens a slide-out, then hands over to one Add Dog slide-out for that person', async () => {
    const { user } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: 'Add Person Only' }));
    await screen.findByLabelText(/First Name/i);
    expect(dialogs()).toHaveLength(1);
    expect(panel()).not.toBeNull();
    expect(within(panel() as HTMLElement).getByLabelText(/First Name/i)).toBeInTheDocument();

    const peak = await peakDialogs(async () => {
      await addPersonThroughForm(user);
      await waitFor(() => expect(screen.getByLabelText(/Call Name/i)).toBeInTheDocument(), {
        timeout: 3000,
      });
    });

    // The person panel left before the dog panel arrived: never two at once.
    expect(peak).toBe(1);
    expect(dialogs()).toHaveLength(1);
    expect(screen.queryByLabelText(/First Name/i)).toBeNull();
    expect(within(panel() as HTMLElement).getByLabelText(/Call Name/i)).toBeInTheDocument();
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
  });
});

describe('DogSelectionStepEnhanced Dog Only', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('opens Add Dog as a slide-out', async () => {
    listed.dogs = [ACE];
    const { user } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Create New/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Dog Only/ }));
    await screen.findByLabelText(/Call Name/i);

    expect(dialogs()).toHaveLength(1);
    expect(panel()).not.toBeNull();
    expect(within(panel() as HTMLElement).getByLabelText(/Call Name/i)).toBeInTheDocument();
  });
});
