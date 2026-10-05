/**
 * MYK9-982 — an exhibitor cannot re-enter a class the dog withdrew from. The
 * class step shows it unavailable with the reason; the secretary flow is not
 * blocked (staff add the entry by hand).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { ClassSelectionStep } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const TRIAL_ID = 'trial-saturday';
const DOG_ID = 'dog-1';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000040';
const CLUB_ID = 'club-heartland';

function setupStepMocks(opts: {
  /** Status on the REPLICATED class — the source the step prefers. */
  replicatedStatus?: string | undefined;
  /** Status on the availability row — the fallback source. */
  availabilityStatus?: string | null;
  /** `hasStarted` on the availability payload: a dog in the ring, or a score. */
  hasStarted?: boolean;
  isStaff?: boolean;
  /** Staff of ANOTHER club: holds the secretary role, but not on this show's club. */
  isOtherClubStaff?: boolean;
  /** Also holds an exhibitor profile. */
  hasExhibitorProfile?: boolean;
  reEntryReason?: string | null;
}) {
  const {
    replicatedStatus,
    availabilityStatus = 'upcoming',
    hasStarted = false,
    isStaff = false,
    isOtherClubStaff = false,
    hasExhibitorProfile = false,
    reEntryReason = null,
  } = opts;

  mockUseDogStoreCompat.mockReturnValue({
    dogs: [
      {
        id: DOG_ID,
        name: 'Rex',
        callName: 'Rex',
        registrations: [
          {
            id: 'reg-akc',
            organization: 'AKC',
            registeredName: 'Rex of MyK9',
            breed: 'Beagle',
            registrationNumber: 'AKC123',
            status: 'Active',
          },
        ],
      },
    ],
    refetch: vi.fn(),
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
          registryId: 'AKC',
          trialType: 'Nosework',
          order: '1',
          trialDate: '2026-10-24',
        },
      ],
      trialClasses: replicatedStatus
        ? {
            [TRIAL_ID]: [
              {
                id: CLASS_ID,
                name: 'Interior Advanced Preliminary',
                element: 'Interior',
                level: 'Advanced',
                section: '',
                status: replicatedStatus,
                trial_id: TRIAL_ID,
              },
            ],
          }
        : {},
    })
  );
  mockUseCartItems.mockReturnValue([]);
  mockUseCartStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({
      cart: { id: 'cart-1', show_id: SHOW_ID, exhibitor_id: 'exhibitor-1', items: [] },
      isLoading: false,
      ensureCart: vi.fn().mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(resolve, 50, {
              kind: 'ready',
              cart: { id: 'cart-1', show_id: SHOW_ID, exhibitor_id: 'exhibitor-1', items: [] },
            })
          )
      ),
      addItem: vi.fn().mockResolvedValue(true),
      removeItem: vi.fn().mockResolvedValue(true),
    })
  );
  mockUseClassStoreCompat.mockReturnValue({ classes: [] });
  // The staff carve-out is SCOPED to the show's owning club, so a bare
  // `isSecretary` is not enough — the viewer must hold the secretary role on
  // CLUB_ID. That is the whole point of the scoping: a secretary of another
  // club must see the chip blocked, exactly as the RPC would refuse them.
  mockUseAuthContext.mockReturnValue({
    isSecretary: isStaff || isOtherClubStaff,
    isAdmin: false,
    user: null,
    hasRole: vi.fn().mockReturnValue(false),
    userWithRoles: isStaff
      ? { scopes: [{ scopeType: 'club', scopeId: CLUB_ID, roleId: 'secretary' }] }
      : isOtherClubStaff
        ? { scopes: [{ scopeType: 'club', scopeId: 'club-elsewhere', roleId: 'secretary' }] }
        : { scopes: [] },
  });
  mockUseExhibitorProfile.mockReturnValue({
    profile: !(isStaff || isOtherClubStaff) || hasExhibitorProfile ? { id: 'exhibitor-1' } : null,
  });
  mockUseExistingEntries.mockReturnValue({
    getExistingEntry: vi.fn().mockReturnValue(undefined),
    getEntriesForDog: vi.fn().mockReturnValue([]),
    getReEntryBlockReason: vi.fn().mockReturnValue(reEntryReason),
  });
  mockUseClassAvailability.mockReturnValue({
    classes: [
      {
        classId: CLASS_ID,
        className: 'Interior Advanced Preliminary',
        element: 'Interior',
        level: 'Advanced',
        section: null,
        status: availabilityStatus,
        hasStarted,
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

function renderStep() {
  return render(
    <ClassSelectionStep
      selectedDogs={[DOG_ID]}
      classSelections={[]}
      onSelectionChange={vi.fn()}
      showId={SHOW_ID}
    />
  );
}

describe('ClassSelectionStep — withdrawn re-entry (MYK9-982)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a withdrawn class disabled, with the reason', async () => {
    setupStepMocks({ reEntryReason: 'Withdrawn from this class' });
    renderStep();

    expect(await screen.findByText('Withdrawn from this class')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('leaves a class with no ended entry selectable', async () => {
    setupStepMocks({});
    renderStep();

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn from this class')).not.toBeInTheDocument();
    // The chip stays aria-disabled ("Loading your cart…") until ensureCart resolves, so wait
    // for the cart rather than asserting on the first paint.
    await waitFor(() =>
      expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true')
    );
  });

  it('does not block the secretary flow', async () => {
    setupStepMocks({ isStaff: true, reEntryReason: 'Withdrawn from this class' });
    renderStep();

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn from this class')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it("blocks a secretary of ANOTHER club entering this show's class", async () => {
    setupStepMocks({ isOtherClubStaff: true, reEntryReason: 'Withdrawn from this class' });
    renderStep();

    expect(await screen.findByText('Withdrawn from this class')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });

  it("does not block the owning club's staff who also hold an exhibitor profile", async () => {
    setupStepMocks({
      isStaff: true,
      hasExhibitorProfile: true,
      reEntryReason: 'Withdrawn from this class',
    });
    renderStep();

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn from this class')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true');
  });
});
