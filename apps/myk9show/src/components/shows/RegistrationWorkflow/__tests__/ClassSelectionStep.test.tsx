/**
 * Tests for ClassSelectionStep wait list status display.
 *
 * Covers:
 * - "Full: join wait list" badge on ElementCard when isJudgeDayFull = true
 * - Badge includes waiting count when waitlistCount > 0
 * - No badge rendered for available classes
 * - ClassSelectionStep fetches availability and surfaces the badge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ElementCard } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';
import type { LevelInfo } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.types';

// ─── ElementCard unit tests (no heavy mocks needed) ────────────────────────────

const baseLevel: LevelInfo = {
  classId: 'c1',
  level: 'Novice',
  section: 'A',
  displayLabel: 'Novice A',
  isSelected: false,
  isAlreadyEntered: false,
};

const defaultProps = {
  element: 'Container',
  levels: [baseLevel],
  fee: 15,
  isSingleClass: false,
  onToggle: vi.fn(),
};

describe('ElementCard — wait list badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Full: join wait list" badge when judge-day is full', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isFull: true, waitlistCount: 0 }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.getByText('Full: join wait list')).toBeInTheDocument();
  });

  it('shows waiting count in badge when waitlistCount > 0', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isFull: true, waitlistCount: 4 }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.getByText('Full: join wait list')).toBeInTheDocument();
    expect(screen.getByText('(4 waiting)')).toBeInTheDocument();
  });

  it('does not show waitlist count when waitlistCount is 0', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isFull: true, waitlistCount: 0 }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.queryByText(/waiting/)).not.toBeInTheDocument();
  });

  it('does not show the badge for available classes', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isFull: false, waitlistCount: 0 }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.queryByText('Full: join wait list')).not.toBeInTheDocument();
  });

  it('does not show the badge when isJudgeDayFull is undefined', () => {
    render(<ElementCard {...defaultProps} levels={[baseLevel]} />);
    expect(screen.queryByText('Full: join wait list')).not.toBeInTheDocument();
  });

  it('does not show badge for already-entered full classes', () => {
    // If already entered, the badge is suppressed — no point in re-advertising waitlist
    const levels: LevelInfo[] = [
      { ...baseLevel, isFull: true, isAlreadyEntered: true, waitlistCount: 2 },
    ];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.queryByText('Full: join wait list')).not.toBeInTheDocument();
  });

  it('surfaces already-entered classes with a visible badge', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isAlreadyEntered: true }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.getByText('Already entered')).toBeInTheDocument();
  });

  it('labels a selected class as in the cart without calling it submitted', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isSelected: true }];
    render(<ElementCard {...defaultProps} levels={levels} />);

    expect(screen.getByText('In cart')).toBeInTheDocument();
    expect(screen.queryByText('Already entered')).toBeNull();
  });

  it('still allows toggling (checkbox enabled) for a full-but-selectable class', async () => {
    const onToggle = vi.fn();
    const levels: LevelInfo[] = [{ ...baseLevel, isFull: true, waitlistCount: 1 }];
    const { user } = render(<ElementCard {...defaultProps} levels={levels} onToggle={onToggle} />);
    // The chip label text is the displayLabel
    await user.click(screen.getByText('Novice A'));
    expect(onToggle).toHaveBeenCalledWith('c1');
  });

  it('blocks class selection and explains a missing registry registration', () => {
    const onAddRegistration = vi.fn();
    const levels: LevelInfo[] = [
      {
        ...baseLevel,
        isRegistrationBlocked: true,
        registrationGuidance: "Add this dog's AKC registration before selecting this class.",
      },
    ];
    render(<ElementCard {...defaultProps} levels={levels} onAddRegistration={onAddRegistration} />);

    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Add this dog's AKC registration/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add required registration' })).toBeInTheDocument();
  });

  it('keeps a puppy-exception class selectable while explaining why', () => {
    const levels: LevelInfo[] = [
      {
        ...baseLevel,
        registrationGuidance:
          'Puppy conformation classes may be entered before registration is complete.',
      },
    ];
    render(<ElementCard {...defaultProps} levels={levels} />);

    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Puppy conformation classes may be entered/i)).toBeInTheDocument();
  });
});

// ─── Single-class variant ──────────────────────────────────────────────────────

describe('ElementCard (single-class) — wait list badge', () => {
  const singleClassLevel: LevelInfo = {
    classId: 's1',
    level: '',
    section: undefined,
    displayLabel: '',
    isSelected: false,
    isAlreadyEntered: false,
  };

  it('shows badge on single-class element when judge-day is full', () => {
    const levels: LevelInfo[] = [{ ...singleClassLevel, isFull: true, waitlistCount: 3 }];
    render(
      <ElementCard
        element="Detective"
        levels={levels}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Full: join wait list')).toBeInTheDocument();
    expect(screen.getByText('(3 waiting)')).toBeInTheDocument();
  });

  it('does not show badge on single-class element when available', () => {
    const levels: LevelInfo[] = [{ ...singleClassLevel, isFull: false }];
    render(
      <ElementCard
        element="Detective"
        levels={levels}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.queryByText('Full: join wait list')).not.toBeInTheDocument();
  });

  it('surfaces an already-entered single class with a visible badge', () => {
    const levels: LevelInfo[] = [{ ...singleClassLevel, isAlreadyEntered: true }];
    render(
      <ElementCard
        element="Detective"
        levels={levels}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Already entered')).toBeInTheDocument();
  });

  it('labels a selected single class as in the cart', () => {
    const levels: LevelInfo[] = [{ ...singleClassLevel, isSelected: true }];
    render(
      <ElementCard
        element="Detective"
        levels={levels}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('In cart')).toBeInTheDocument();
  });
});

// ─── ClassSelectionStep integration (badge surfaced via useClassAvailability) ──

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

const SHOW_ID = 'show-1';
const TRIAL_ID = 'trial-1';
const DOG_ID = 'dog-1';
const CLASS_ID = 'class-full';

function setupDefaultMocks(overrides: { judgeDayFull?: boolean; waitlistCount?: number } = {}) {
  const { judgeDayFull = false, waitlistCount = 0 } = overrides;

  mockUseDogStoreCompat.mockReturnValue({
    dogs: [{ id: DOG_ID, name: 'Rex', callName: 'Rex', registrations: [] }],
  });
  mockUseShowStore.mockReturnValue({
    shows: [
      {
        id: SHOW_ID,
        name: 'Test Show',
        preEntryFee: '15',
        startDate: '2026-06-01',
      },
    ],
  });
  mockUseTrialStore.mockImplementation((selector: (s: unknown) => unknown) => {
    const state = {
      trials: [
        {
          id: TRIAL_ID,
          showId: SHOW_ID,
          name: 'Trial 1',
          registryId: 'AKC',
          trialType: 'Nosework',
          order: '1',
          trialDate: '2026-05-01',
        },
      ],
      trialClasses: {
        [TRIAL_ID]: [
          { id: CLASS_ID, element: 'Container', level: 'Novice', section: 'A', trial_id: TRIAL_ID },
        ],
      },
    };
    return selector(state);
  });
  mockUseCartItems.mockReturnValue([]);
  mockUseCartStore.mockImplementation((selector: (s: unknown) => unknown) => {
    const state = {
      cart: null,
      loadCart: vi.fn().mockResolvedValue(null),
      createCart: vi.fn().mockResolvedValue(null),
      addItem: vi.fn().mockResolvedValue(true),
      removeItem: vi.fn().mockResolvedValue(true),
    };
    return selector(state);
  });
  mockUseClassStoreCompat.mockReturnValue({
    classes: [
      {
        id: CLASS_ID,
        trialId: TRIAL_ID,
        className: 'Container Novice',
        element: 'Container',
        level: 'Novice',
        section: undefined,
        entryFee: 15,
      },
    ],
  });
  mockUseAuthContext.mockReturnValue({ isSecretary: false, isAdmin: false, user: null });
  mockUseExhibitorProfile.mockReturnValue({ profile: null });
  mockUseExistingEntries.mockReturnValue({
    getExistingEntry: vi.fn().mockReturnValue(undefined),
    getEntriesForDog: vi.fn().mockReturnValue([]),
  });
  mockUseClassAvailability.mockReturnValue({
    classes: [
      {
        classId: CLASS_ID,
        className: 'Container Novice A',
        level: 'Novice',
        trialId: TRIAL_ID,
        trialName: 'Trial 1',
        trialDate: '2026-05-01',
        entryLimit: 0,
        currentEntries: 125,
        spotsAvailable: 0,
        waitlistCount,
        isFull: judgeDayFull,
        hasWaitlist: waitlistCount > 0,
        judgeId: 'judge-1',
        judgeDayFull,
        judgeDayAvailable: judgeDayFull ? 0 : 10,
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    totalSpotsAvailable: judgeDayFull ? 0 : 10,
    fullClasses: judgeDayFull ? 1 : 0,
  });
}

describe('ClassSelectionStep — wait list badge (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Full: join wait list" badge when judge-day is full', async () => {
    setupDefaultMocks({ judgeDayFull: true, waitlistCount: 0 });
    render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={vi.fn()}
        showId={SHOW_ID}
      />
    );
    expect(await screen.findByText('Full: join wait list')).toBeInTheDocument();
  });

  it('shows waiting count when waitlistCount > 0', async () => {
    setupDefaultMocks({ judgeDayFull: true, waitlistCount: 7 });
    render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={vi.fn()}
        showId={SHOW_ID}
      />
    );
    expect(await screen.findByText('(7 waiting)')).toBeInTheDocument();
  });

  it('does not show badge when class is available', async () => {
    setupDefaultMocks({ judgeDayFull: false, waitlistCount: 0 });
    render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={vi.fn()}
        showId={SHOW_ID}
      />
    );
    // Wait for the class chip to appear
    expect(await screen.findByText('Novice A')).toBeInTheDocument();
    expect(screen.queryByText('Full: join wait list')).not.toBeInTheDocument();
  });
});

describe('ClassSelectionStep — empty class inventory', () => {
  it('renders availability-backed classes when trialStore has trials but no class groups yet', async () => {
    setupDefaultMocks({ judgeDayFull: false, waitlistCount: 0 });
    mockUseTrialStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = {
        trials: [
          {
            id: TRIAL_ID,
            showId: SHOW_ID,
            name: 'Trial 1',
            registryId: 'AKC',
            trialType: 'Nosework',
            order: '1',
            trialDate: '2026-05-01',
          },
        ],
        trialClasses: {},
      };
      return selector(state);
    });
    mockUseClassStoreCompat.mockReturnValue({ classes: [] });
    mockUseClassAvailability.mockReturnValue({
      classes: [
        {
          classId: CLASS_ID,
          className: 'Container Novice',
          element: 'Container',
          level: 'Novice',
          section: undefined,
          trialId: TRIAL_ID,
          trialName: 'Trial 1',
          trialDate: '2026-05-01',
          entryLimit: 0,
          currentEntries: 0,
          spotsAvailable: 10,
          waitlistCount: 0,
          isFull: false,
          hasWaitlist: false,
          judgeId: null,
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

    render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={vi.fn()}
        showId={SHOW_ID}
      />
    );

    expect(await screen.findByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Novice')).toBeInTheDocument();
  });

  const setupEmptyInventory = () => {
    setupDefaultMocks({ judgeDayFull: false, waitlistCount: 0 });
    mockUseTrialStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = {
        trials: [
          {
            id: TRIAL_ID,
            showId: SHOW_ID,
            name: 'Trial 1',
            registryId: 'AKC',
            trialType: 'Nosework',
            order: '1',
            trialDate: '2026-05-01',
          },
        ],
        trialClasses: {},
      };
      return selector(state);
    });
    mockUseClassStoreCompat.mockReturnValue({ classes: [] });
    mockUseClassAvailability.mockReturnValue({
      classes: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      totalSpotsAvailable: 0,
      fullClasses: 0,
    });
  };

  const renderStep = () =>
    render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={vi.fn()}
        showId={SHOW_ID}
      />
    );

  it('shows a no-classes alert instead of a blank panel when every source is empty', async () => {
    setupEmptyInventory();
    renderStep();

    expect(await screen.findByText(/No classes available yet/i)).toBeInTheDocument();
  });

  it('gives an exhibitor a recovery path (contact the organizer) when no classes exist', async () => {
    setupEmptyInventory();
    // Default auth context is a non-organizer (isSecretary/isAdmin false).
    renderStep();

    expect(await screen.findByText(/Please contact the show organizer/i)).toBeInTheDocument();
  });

  it('tells an organizer where to add classes when no classes exist', async () => {
    setupEmptyInventory();
    mockUseAuthContext.mockReturnValue({ isSecretary: true, isAdmin: false, user: null });
    renderStep();

    expect(await screen.findByText(/Add classes in the show management page/i)).toBeInTheDocument();
  });
});

// ─── 6.4 — entry-action tests (add-only wizard, tasks.md exhibitor-journey-completion) ──

describe('ClassSelectionStep — add-only entry actions (6.4)', () => {
  const NEW_CLASS_ID = 'class-new';

  function setupAddOnlyMocks() {
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
    });
    mockUseShowStore.mockReturnValue({
      shows: [{ id: SHOW_ID, name: 'Test Show', preEntryFee: '15', startDate: '2026-06-01' }],
    });
    mockUseTrialStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = {
        trials: [
          {
            id: TRIAL_ID,
            showId: SHOW_ID,
            name: 'Trial 1',
            registryId: 'AKC',
            trialType: 'Nosework',
            order: '1',
            trialDate: '2026-05-01',
          },
        ],
        trialClasses: {
          [TRIAL_ID]: [
            {
              id: CLASS_ID,
              element: 'Container',
              level: 'Novice',
              section: 'A',
              trial_id: TRIAL_ID,
            },
            {
              id: NEW_CLASS_ID,
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trial_id: TRIAL_ID,
            },
          ],
        },
      };
      return selector(state);
    });
    mockUseCartItems.mockReturnValue([]);
    mockUseCartStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = {
        cart: null,
        loadCart: vi.fn().mockResolvedValue(null),
        createCart: vi.fn().mockResolvedValue(null),
        addItem: vi.fn().mockResolvedValue(true),
        removeItem: vi.fn().mockResolvedValue(true),
      };
      return selector(state);
    });
    mockUseClassStoreCompat.mockReturnValue({
      classes: [
        {
          id: CLASS_ID,
          trialId: TRIAL_ID,
          className: 'Container Novice',
          element: 'Container',
          level: 'Novice',
          section: undefined,
          entryFee: 15,
        },
        {
          id: NEW_CLASS_ID,
          trialId: TRIAL_ID,
          className: 'Interior Novice',
          element: 'Interior',
          level: 'Novice',
          section: undefined,
          entryFee: 15,
        },
      ],
    });
    mockUseAuthContext.mockReturnValue({ isSecretary: false, isAdmin: false, user: null });
    mockUseExhibitorProfile.mockReturnValue({ profile: null });
    // Rex is already entered in CLASS_ID only — NEW_CLASS_ID is add-only.
    mockUseExistingEntries.mockReturnValue({
      getExistingEntry: vi.fn((_dogId: string, classId: string) =>
        classId === CLASS_ID ? { id: 'entry-1', dogId: DOG_ID, classId: CLASS_ID } : undefined
      ),
      getEntriesForDog: vi.fn(() => [{ id: 'entry-1', dogId: DOG_ID, classId: CLASS_ID }]),
    });
    mockUseClassAvailability.mockReturnValue({
      classes: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      totalSpotsAvailable: 10,
      fullClasses: 0,
    });
  }

  const renderAddOnlyStep = (onSelectionChange = vi.fn()) => {
    render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={onSelectionChange}
        showId={SHOW_ID}
      />
    );
    return onSelectionChange;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupAddOnlyMocks();
  });

  it('(a) renders the already-entered class as a disabled checkbox labeled "Already entered"', async () => {
    renderAddOnlyStep();

    const entered = await screen.findByRole('checkbox', { name: /already entered:.*novice a/i });
    expect(entered).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Already entered').length).toBeGreaterThan(0);
  });

  it('(b) renders a newly-available class as a selectable, enabled checkbox', async () => {
    renderAddOnlyStep();

    const selectable = await screen.findByRole('checkbox', { name: /select novice a/i });
    expect(selectable).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('(c) explains existing entries are changed through the show team, linking /messages/:showId', async () => {
    renderAddOnlyStep();

    expect(await screen.findByText(/already entered in the classes marked/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /message the show team/i });
    expect(link).toHaveAttribute('href', `/messages/${SHOW_ID}`);
  });

  it('(d) selecting a newly-available class reports the addition (enables Next upstream)', async () => {
    const onSelectionChange = vi.fn();
    const { user } = render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={onSelectionChange}
        showId={SHOW_ID}
      />
    );

    const selectable = await screen.findByRole('checkbox', { name: /select novice a/i });
    await user.click(selectable);

    expect(onSelectionChange).toHaveBeenCalled();
    const [selections] = onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1];
    const dogSelection = selections.find((s: { dogId: string }) => s.dogId === DOG_ID);
    expect(
      dogSelection?.selectedClasses.some((c: { classId: string }) => c.classId === NEW_CLASS_ID)
    ).toBe(true);
  });

  it('(f) a failed add-to-cart mutation surfaces an error and preserves the prior selection', async () => {
    const failingAddItem = vi.fn().mockResolvedValue(false);
    mockUseCartStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = {
        cart: null,
        loadCart: vi.fn().mockResolvedValue(null),
        createCart: vi.fn().mockResolvedValue(null),
        addItem: failingAddItem,
        removeItem: vi.fn().mockResolvedValue(true),
      };
      return selector(state);
    });
    mockUseExhibitorProfile.mockReturnValue({ profile: { id: 'exhibitor-1' } });

    const onSelectionChange = vi.fn();
    const { user } = render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={onSelectionChange}
        showId={SHOW_ID}
      />
    );

    const selectable = await screen.findByRole('checkbox', { name: /select novice a/i });
    await user.click(selectable);

    expect(failingAddItem).toHaveBeenCalled();
    // The failed mutation must not report a (nonexistent) selection change,
    // and the wizard must not close/crash — the checkbox is still present
    // and still unchecked, ready to retry.
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(await screen.findByRole('checkbox', { name: /select novice a/i })).not.toBeChecked();
  });
});
