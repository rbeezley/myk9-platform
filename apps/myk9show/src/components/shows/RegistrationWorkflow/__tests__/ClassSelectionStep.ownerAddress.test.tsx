/**
 * MYK9-1010 — an AKC class needs the owner's address (AKC Scent Work
 * Regulations Ch.3 §36 item 8: the marked catalog prints it). The class step
 * blocks an AKC class for a dog whose owner has an incomplete address, names
 * the missing parts and offers the fix; UKC/ASCA trials and complete addresses
 * are untouched; the staff desk late-entry path warns but does not block.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';

const {
  mockUseClassAvailability,
  mockUseDogStoreCompat,
  mockUseShowStore,
  mockUseTrialStore,
  mockUseCartStore,
  mockUseCartItems,
  mockUseClassStoreCompat,
  mockUseAuthContext,
  mockUseExhibitorProfile,
  mockUseExistingEntries,
  mockRefetchDogs,
  mockUseUserQuery,
  mockUpdateUser,
} = vi.hoisted(() => ({
  mockUseClassAvailability: vi.fn(),
  mockUseDogStoreCompat: vi.fn(),
  mockUseShowStore: vi.fn(),
  mockUseTrialStore: vi.fn(),
  mockUseCartStore: vi.fn(),
  mockUseCartItems: vi.fn(),
  mockUseClassStoreCompat: vi.fn(),
  mockUseAuthContext: vi.fn(),
  mockUseExhibitorProfile: vi.fn(),
  mockUseExistingEntries: vi.fn(),
  mockRefetchDogs: vi.fn(),
  mockUseUserQuery: vi.fn(),
  mockUpdateUser: vi.fn(),
}));

vi.mock('@/hooks/useClassAvailability', () => ({ useClassAvailability: mockUseClassAvailability }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: mockUseDogStoreCompat }));
vi.mock('@/store/showStore', () => ({ useShowStore: mockUseShowStore }));
vi.mock('@/store/trialStore', () => ({ useTrialStore: mockUseTrialStore }));
vi.mock('@/store/cartStore', () => ({
  useCartStore: mockUseCartStore,
  useCartItems: mockUseCartItems,
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: mockUseClassStoreCompat }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mockUseAuthContext }));
vi.mock('@/hooks/useExhibitorProfile', () => ({ useExhibitorProfile: mockUseExhibitorProfile }));
vi.mock('@/hooks/useExistingEntries', () => ({ useExistingEntries: mockUseExistingEntries }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: { isSyncing: false, tablesStatus: { trials: 'success' } },
  }),
}));
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUserQuery: mockUseUserQuery,
  useUpdateUserMutation: () => ({ mutateAsync: mockUpdateUser, isPending: false }),
}));
// The real panel is a large form; this stand-in proves the step opens it for
// the right person, saves through the person update, and refreshes the dogs.
vi.mock('@/components/panels/edit/UserEditPanel', () => ({
  UserEditPanel: (props: {
    open: boolean;
    userId: string;
    userName: string;
    onSave?: (data: Record<string, unknown>) => Promise<void>;
  }) =>
    props.open ? (
      <div role="dialog" aria-label={`Edit ${props.userName}`}>
        <span>{props.userId}</span>
        <button
          type="button"
          onClick={() =>
            void props.onSave?.({
              streetAddress: '12 Elm St',
              city: 'Springfield',
              state: 'IL',
              zipCode: '62701',
            })
          }
        >
          Save person
        </button>
      </div>
    ) : null,
}));

import { ClassSelectionStep } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep';

const SHOW_ID = 'dededede-0000-0000-0000-000000001010';
const TRIAL_ID = 'trial-saturday';
const DOG_ID = 'dog-1';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000001010';
const CLUB_ID = 'club-heartland';

const NO_STREET_OR_ZIP = {
  id: 'person-owner',
  name: 'Pat Owner',
  streetAddress: '  ',
  city: 'Springfield',
  state: 'IL',
};
const COMPLETE = { ...NO_STREET_OR_ZIP, streetAddress: '12 Elm St', zipCode: '62701' };

function registration(organization: string) {
  return {
    id: `reg-${organization}`,
    organization,
    registeredName: 'Rex of MyK9',
    breed: 'Beagle',
    registrationNumber: `${organization}123`,
    status: 'Active',
  };
}

function setupStepMocks(opts: {
  registryId?: string;
  owner?: Record<string, unknown> | undefined;
  isStaff?: boolean;
}) {
  const { registryId = 'AKC', owner, isStaff = false } = opts;

  mockUseDogStoreCompat.mockReturnValue({
    dogs: [
      {
        id: DOG_ID,
        name: 'Rex',
        callName: 'Rex',
        ownerId: 'person-owner',
        ...(owner && { owner }),
        registrations: [registration('AKC'), registration('UKC')],
      },
    ],
    refetch: mockRefetchDogs,
  });
  mockUseShowStore.mockReturnValue({
    shows: [
      {
        id: SHOW_ID,
        name: 'Heartland Scent Work Classic',
        preEntryFee: '30',
        startDate: '2026-10-24',
        clubId: CLUB_ID,
      },
    ],
  });
  mockUseTrialStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({
      trials: [
        {
          id: TRIAL_ID,
          showId: SHOW_ID,
          name: 'Saturday Trial',
          registryId,
          trialType: 'Nosework',
          order: '1',
          trialDate: '2026-10-24',
        },
      ],
      trialClasses: {},
    })
  );
  mockUseCartItems.mockReturnValue([]);
  mockUseCartStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({
      cart: { id: 'cart-1', show_id: SHOW_ID, exhibitor_id: 'exhibitor-1', items: [] },
      isLoading: false,
      ensureCart: vi.fn().mockResolvedValue({
        kind: 'ready',
        cart: { id: 'cart-1', show_id: SHOW_ID, exhibitor_id: 'exhibitor-1', items: [] },
      }),
      addItem: vi.fn().mockResolvedValue(true),
      removeItem: vi.fn().mockResolvedValue(true),
    })
  );
  mockUseClassStoreCompat.mockReturnValue({ classes: [] });
  mockUseAuthContext.mockReturnValue({
    isSecretary: isStaff,
    isAdmin: false,
    user: null,
    hasRole: vi.fn().mockReturnValue(false),
    userWithRoles: isStaff
      ? { scopes: [{ scopeType: 'club', scopeId: CLUB_ID, roleId: 'secretary' }] }
      : { scopes: [] },
  });
  mockUseExhibitorProfile.mockReturnValue({ profile: { id: 'exhibitor-1' } });
  mockUseExistingEntries.mockReturnValue({
    getExistingEntry: vi.fn().mockReturnValue(undefined),
    getEntriesForDog: vi.fn().mockReturnValue([]),
    getReEntryBlockReason: vi.fn().mockReturnValue(null),
  });
  mockUseClassAvailability.mockReturnValue({
    classes: [
      {
        classId: CLASS_ID,
        className: 'Interior Advanced',
        element: 'Interior',
        level: 'Advanced',
        section: null,
        status: 'upcoming',
        hasStarted: false,
        trialId: TRIAL_ID,
        trialName: 'Saturday Trial',
        trialDate: '2026-10-24',
        entryLimit: 0,
        currentEntries: 3,
        spotsAvailable: 10,
        waitlistCount: 0,
        isFull: false,
        hasWaitlist: false,
        allowsWaitlist: false,
        judgeId: 'judge-1',
        judgeDayFull: false,
        judgeDayAvailable: 10,
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    totalSpotsAvailable: 10,
    fullClasses: 0,
  });
}

function renderStep(props: Partial<React.ComponentProps<typeof ClassSelectionStep>> = {}) {
  return render(
    <ClassSelectionStep
      selectedDogs={[DOG_ID]}
      classSelections={[]}
      onSelectionChange={vi.fn()}
      showId={SHOW_ID}
      {...props}
    />
  );
}

const enabled = () =>
  waitFor(() => expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true'));

describe("ClassSelectionStep — the owner's address on AKC classes (MYK9-1010)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserQuery.mockReturnValue({
      data: {
        id: 'person-owner',
        firstName: 'Pat',
        lastName: 'Owner',
        city: 'Springfield',
        state: 'IL',
      },
    });
    mockUpdateUser.mockResolvedValue({});
  });

  it('blocks an AKC class, names the missing parts, and links to the profile', async () => {
    setupStepMocks({ owner: NO_STREET_OR_ZIP });
    renderStep({ workflowMode: 'exhibitor' });

    expect(
      await screen.findByText(
        "Add your street address and ZIP or postal code to enter AKC classes. AKC prints the owner's address in the catalog."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Add your address' })).toHaveAttribute(
      'href',
      '/account?section=profile'
    );
  });

  it('leaves a UKC class selectable for the same owner', async () => {
    setupStepMocks({ owner: NO_STREET_OR_ZIP, registryId: 'UKC' });
    renderStep({ workflowMode: 'exhibitor' });

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText(/to enter AKC classes/)).not.toBeInTheDocument();
    await enabled();
  });

  it('leaves an AKC class selectable when the address is complete', async () => {
    setupStepMocks({ owner: COMPLETE });
    renderStep({ workflowMode: 'exhibitor' });

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText(/to enter AKC classes/)).not.toBeInTheDocument();
    await enabled();
  });

  it('does not block when the owner was not read (unknown is not missing)', async () => {
    setupStepMocks({ owner: undefined });
    renderStep({ workflowMode: 'exhibitor' });

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText(/to enter AKC classes/)).not.toBeInTheDocument();
    await enabled();
  });

  it("staff fix the owner's address in place, and the dogs refresh after the save", async () => {
    setupStepMocks({ owner: NO_STREET_OR_ZIP, isStaff: true });
    renderStep({ workflowMode: 'secretary_new' });

    expect(
      await screen.findByText(
        "Add the owner's street address and ZIP or postal code to enter AKC classes. AKC prints the owner's address in the catalog."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(screen.getByRole('button', { name: "Add the owner's address" }));
    const panel = await screen.findByRole('dialog', { name: 'Edit Pat Owner' });
    expect(panel).toHaveTextContent('person-owner');

    await userEvent.click(screen.getByRole('button', { name: 'Save person' }));
    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({
        id: 'person-owner',
        updates: expect.objectContaining({
          address: '12 Elm St',
          city: 'Springfield',
          state: 'IL',
          zipCode: '62701',
        }),
      })
    );
    await waitFor(() => expect(mockRefetchDogs).toHaveBeenCalled());
  });

  it('the desk late-entry path warns but leaves the class selectable', async () => {
    setupStepMocks({ owner: NO_STREET_OR_ZIP, isStaff: true });
    renderStep({ workflowMode: 'secretary_new', ownerAddressWarnOnly: true });

    expect(
      await screen.findByText(
        "The owner's address is missing its street address and ZIP or postal code. AKC prints it in the catalog, so add it when you can."
      )
    ).toBeInTheDocument();
    await enabled();
  });
});
