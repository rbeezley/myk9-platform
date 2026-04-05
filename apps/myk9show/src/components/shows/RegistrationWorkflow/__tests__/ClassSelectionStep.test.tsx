/**
 * Tests for ClassSelectionStep wait list status display.
 *
 * Covers:
 * - "Full — Join Wait List" badge on ElementCard when isJudgeDayFull = true
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

  it('shows "Full — Join Wait List" badge when judge-day is full', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isJudgeDayFull: true, waitlistCount: 0 }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.getByText('Full — Join Wait List')).toBeInTheDocument();
  });

  it('shows waiting count in badge when waitlistCount > 0', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isJudgeDayFull: true, waitlistCount: 4 }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.getByText('Full — Join Wait List')).toBeInTheDocument();
    expect(screen.getByText('(4 waiting)')).toBeInTheDocument();
  });

  it('does not show waitlist count when waitlistCount is 0', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isJudgeDayFull: true, waitlistCount: 0 }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.queryByText(/waiting/)).not.toBeInTheDocument();
  });

  it('does not show the badge for available classes', () => {
    const levels: LevelInfo[] = [{ ...baseLevel, isJudgeDayFull: false, waitlistCount: 0 }];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.queryByText('Full — Join Wait List')).not.toBeInTheDocument();
  });

  it('does not show the badge when isJudgeDayFull is undefined', () => {
    render(<ElementCard {...defaultProps} levels={[baseLevel]} />);
    expect(screen.queryByText('Full — Join Wait List')).not.toBeInTheDocument();
  });

  it('does not show badge for already-entered full classes', () => {
    // If already entered, the badge is suppressed — no point in re-advertising waitlist
    const levels: LevelInfo[] = [
      { ...baseLevel, isJudgeDayFull: true, isAlreadyEntered: true, waitlistCount: 2 },
    ];
    render(<ElementCard {...defaultProps} levels={levels} />);
    expect(screen.queryByText('Full — Join Wait List')).not.toBeInTheDocument();
  });

  it('still allows toggling (checkbox enabled) for a full-but-selectable class', async () => {
    const onToggle = vi.fn();
    const levels: LevelInfo[] = [{ ...baseLevel, isJudgeDayFull: true, waitlistCount: 1 }];
    const { user } = render(<ElementCard {...defaultProps} levels={levels} onToggle={onToggle} />);
    // The chip label text is the displayLabel
    await user.click(screen.getByText('Novice A'));
    expect(onToggle).toHaveBeenCalledWith('c1');
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
    const levels: LevelInfo[] = [{ ...singleClassLevel, isJudgeDayFull: true, waitlistCount: 3 }];
    render(
      <ElementCard
        element="Detective"
        levels={levels}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Full — Join Wait List')).toBeInTheDocument();
    expect(screen.getByText('(3 waiting)')).toBeInTheDocument();
  });

  it('does not show badge on single-class element when available', () => {
    const levels: LevelInfo[] = [{ ...singleClassLevel, isJudgeDayFull: false }];
    render(
      <ElementCard
        element="Detective"
        levels={levels}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.queryByText('Full — Join Wait List')).not.toBeInTheDocument();
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
  mockUseAuthContext: vi.fn(),
  mockUseExhibitorProfile: vi.fn(),
  mockUseExistingEntries: vi.fn(),
}));

vi.mock('@/hooks/useClassAvailability', () => ({ useClassAvailability: mockUseClassAvailability }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: mockUseDogStoreCompat }));
vi.mock('@/store/showStore', () => ({ useShowStore: mockUseShowStore }));
vi.mock('@/store/trialStore', () => ({ useTrialStore: mockUseTrialStore }));
vi.mock('@/stores/cartStore', () => ({
  useCartStore: mockUseCartStore,
  useCartItems: mockUseCartItems,
}));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mockUseAuthContext }));
vi.mock('@/hooks/useExhibitorProfile', () => ({ useExhibitorProfile: mockUseExhibitorProfile }));
vi.mock('@/hooks/useExistingEntries', () => ({ useExistingEntries: mockUseExistingEntries }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

  it('shows "Full — Join Wait List" badge when judge-day is full', async () => {
    setupDefaultMocks({ judgeDayFull: true, waitlistCount: 0 });
    render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={vi.fn()}
        showId={SHOW_ID}
      />
    );
    expect(await screen.findByText('Full — Join Wait List')).toBeInTheDocument();
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
    expect(screen.queryByText('Full — Join Wait List')).not.toBeInTheDocument();
  });
});
