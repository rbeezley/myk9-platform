/**
 * MYK9-516 — a class the judge has already started must not be enterable.
 *
 * Entry close is a DATE guard; class status is a different axis. On show day a
 * class moves to `in_progress` while the close date is still open, and the
 * wizard rendered it as an ordinary selectable chip: select, pay, committed
 * entry into a running ring. That is a refund and a secretary phone call.
 *
 * `getClassEntryWindow` is unit-tested in
 * `ClassSelectionStep.availability.test.ts`. This file pins the two things the
 * pure function cannot: that the step still READS status off whichever source
 * supplied the class, and that the chip is actually disabled and explained.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ElementCard } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';
import type { LevelInfo } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.types';

const baseLevel: LevelInfo = {
  classId: 'c1',
  level: 'Advanced',
  section: undefined,
  displayLabel: 'Advanced',
  isSelected: false,
  isAlreadyEntered: false,
};

describe('ElementCard — a started class (MYK9-516)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables the chip and says why', () => {
    const levels: LevelInfo[] = [
      { ...baseLevel, isClassClosed: true, classClosedReason: 'This class has started' },
    ];
    render(
      <ElementCard
        element="Interior"
        levels={levels}
        fee={30}
        isSingleClass={false}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('This class has started')).toBeInTheDocument();
  });

  it('describes the chip for a screen reader, not only sighted readers', () => {
    const levels: LevelInfo[] = [
      { ...baseLevel, isClassClosed: true, classClosedReason: 'This class has finished' },
    ];
    render(
      <ElementCard
        element="Interior"
        levels={levels}
        fee={30}
        isSingleClass={false}
        onToggle={vi.fn()}
      />
    );

    const describedBy = screen.getByRole('checkbox').getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('This class has finished');
  });

  it('does not toggle when the chip is clicked anyway', async () => {
    const onToggle = vi.fn();
    const levels: LevelInfo[] = [
      { ...baseLevel, isClassClosed: true, classClosedReason: 'This class has started' },
    ];
    const { user } = render(
      <ElementCard
        element="Interior"
        levels={levels}
        fee={30}
        isSingleClass={false}
        onToggle={onToggle}
      />
    );

    await user.click(screen.getByText('Advanced'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('suppresses the wait-list invitation — a running class takes nothing', () => {
    const levels: LevelInfo[] = [
      {
        ...baseLevel,
        isFull: true,
        allowsWaitlist: true,
        waitlistCount: 3,
        isClassClosed: true,
        classClosedReason: 'This class has started',
      },
    ];
    render(
      <ElementCard
        element="Interior"
        levels={levels}
        fee={30}
        isSingleClass={false}
        onToggle={vi.fn()}
      />
    );

    expect(screen.queryByText('Full: join wait list')).not.toBeInTheDocument();
    expect(screen.getByText('This class has started')).toBeInTheDocument();
  });

  it('disables the single-class variant too', () => {
    const levels: LevelInfo[] = [
      {
        classId: 's1',
        level: '',
        section: undefined,
        displayLabel: '',
        isSelected: false,
        isAlreadyEntered: false,
        isClassClosed: true,
        classClosedReason: 'This class has started',
      },
    ];
    render(
      <ElementCard
        element="Detective"
        levels={levels}
        fee={30}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('This class has started')).toBeInTheDocument();
  });
});

// ─── Step integration: status must survive the trip from the source ───────────

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
}) {
  const {
    replicatedStatus,
    availabilityStatus = 'upcoming',
    hasStarted = false,
    isStaff = false,
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
      cart: null,
      isLoading: false,
      ensureCart: vi.fn().mockResolvedValue({ kind: 'ready', cart: { id: 'cart-1', items: [] } }),
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
    isSecretary: isStaff,
    isAdmin: false,
    user: null,
    hasRole: vi.fn().mockReturnValue(false),
    userWithRoles: isStaff
      ? { scopes: [{ scopeType: 'club', scopeId: CLUB_ID, roleId: 'secretary' }] }
      : { scopes: [] },
  });
  mockUseExhibitorProfile.mockReturnValue({ profile: null });
  mockUseExistingEntries.mockReturnValue({
    getExistingEntry: vi.fn().mockReturnValue(undefined),
    getEntriesForDog: vi.fn().mockReturnValue([]),
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

describe('ClassSelectionStep — started classes (MYK9-516, integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks a running class supplied by the availability read', async () => {
    setupStepMocks({ availabilityStatus: 'in_progress' });
    renderStep();

    expect(await screen.findByText('This class has started')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('blocks a running class supplied by replication, which the step prefers', async () => {
    // The replicated source spells the same state 'In Progress'. Reading only
    // the database spelling would silently stop guarding on the offline path.
    setupStepMocks({ replicatedStatus: 'In Progress' });
    renderStep();

    expect(await screen.findByText('This class has started')).toBeInTheDocument();
  });

  it('blocks a class with a dog in the ring even though status says upcoming', async () => {
    // The column lags the ring until the first score lands, and this is the
    // path the step PREFERS — the replicated class carries only the status, so
    // `hasStarted` has to be looked up by class id or the guard is inert here.
    setupStepMocks({
      replicatedStatus: 'Upcoming',
      availabilityStatus: 'upcoming',
      hasStarted: true,
    });
    renderStep();

    expect(await screen.findByText('This class has started')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('leaves an upcoming class selectable', async () => {
    setupStepMocks({ availabilityStatus: 'upcoming' });
    renderStep();

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText('This class has started')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it("still lets THIS club's secretary take a gate entry into a running class", async () => {
    setupStepMocks({ availabilityStatus: 'in_progress', isStaff: true });
    renderStep();

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText('This class has started')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('blocks a secretary of a DIFFERENT club, as the RPC would', async () => {
    // MYK9-123 / MYK9-458: a global `isSecretary` offers a control the database
    // then refuses. `v_is_official` is club-scoped, so the chip must be too.
    setupStepMocks({ availabilityStatus: 'in_progress', isStaff: true });
    mockUseAuthContext.mockReturnValue({
      isSecretary: true,
      isAdmin: false,
      user: null,
      hasRole: vi.fn().mockReturnValue(false),
      userWithRoles: {
        scopes: [{ scopeType: 'club', scopeId: 'club-somewhere-else', roleId: 'secretary' }],
      },
    });
    renderStep();

    expect(await screen.findByText('This class has started')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });
});
