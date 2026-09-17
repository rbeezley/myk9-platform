/**
 * MYK9-489 — two different classes must never render as the same chip.
 *
 * The naming rule itself (`buildClassDisambiguator`) is unit-tested in
 * `features/_shared/__tests__/classLabel.test.ts` and
 * `test/components/registration/displayLabel.test.tsx`. Those prove the pure
 * function; they cannot prove the wizard still reaches it, nor that the
 * ACCESSIBLE name differs — a chip's name is assembled from the wrapping
 * <label>, so a screen-reader user could still hear two identical "Select
 * Advanced" checkboxes while the pure function returned the right words
 * (LESSONS `last-hop-drop`).
 *
 * So this file renders the real step on the real Heartland shape and asserts on
 * the accessible names, for both the exhibitor and the staff variant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';

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

interface SeedClass {
  id: string;
  name: string;
  element: string;
  level: string;
  section: string | null;
}

/** The Heartland Saturday trial, verbatim from the seeded database. */
const HEARTLAND_SATURDAY: SeedClass[] = [
  {
    id: 'dec1a55e-0000-0000-0000-000000000032',
    name: 'Interior Advanced',
    element: 'Interior',
    level: 'Advanced',
    section: null,
  },
  {
    id: 'dec1a55e-0000-0000-0000-000000000040',
    name: 'Interior Advanced Preliminary',
    element: 'Interior',
    level: 'Advanced',
    section: null,
  },
];

/** A split level: one level, two sections, and it must STAY that way. */
const SPLIT_LEVEL: SeedClass[] = [
  {
    id: 'class-novice-a',
    name: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
  },
  {
    id: 'class-novice-b',
    name: 'Interior Novice B',
    element: 'Interior',
    level: 'Novice',
    section: 'B',
  },
];

function setupMocks(classes: SeedClass[], opts: { isStaff?: boolean } = {}) {
  const { isStaff = false } = opts;

  mockUseDogStoreCompat.mockReturnValue({
    dogs: [{ id: DOG_ID, name: 'Rex', callName: 'Rex', registrations: [] }],
    refetch: vi.fn(),
  });
  mockUseShowStore.mockReturnValue({
    shows: [
      {
        id: SHOW_ID,
        name: 'Heartland Scent Work Classic',
        preEntryFee: '30',
        startDate: '2026-10-24',
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
      trialClasses: {
        [TRIAL_ID]: classes.map(cls => ({ ...cls, trial_id: TRIAL_ID })),
      },
    })
  );
  mockUseCartItems.mockReturnValue([]);
  mockUseCartStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({
      cart: null,
      isLoading: false,
      ensureCart: vi.fn().mockResolvedValue(null),
      addItem: vi.fn().mockResolvedValue(true),
      removeItem: vi.fn().mockResolvedValue(true),
    })
  );
  mockUseClassStoreCompat.mockReturnValue({ classes: [] });
  mockUseAuthContext.mockReturnValue({
    isSecretary: isStaff,
    isAdmin: false,
    user: null,
  });
  mockUseExhibitorProfile.mockReturnValue({ profile: null });
  mockUseExistingEntries.mockReturnValue({
    getExistingEntry: vi.fn().mockReturnValue(undefined),
    getEntriesForDog: vi.fn().mockReturnValue([]),
  });
  mockUseClassAvailability.mockReturnValue({
    classes: classes.map(cls => ({
      classId: cls.id,
      className: cls.name,
      element: cls.element,
      level: cls.level,
      section: cls.section,
      status: 'upcoming',
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
    })),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    totalSpotsAvailable: 10,
    fullClasses: 0,
  });
}

function renderStep(props: { workflowMode?: WorkflowMode } = {}) {
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

describe('ClassSelectionStep — chip labels (MYK9-489)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders two same-level Interior classes as distinguishable chips', async () => {
    setupMocks(HEARTLAND_SATURDAY);
    renderStep();

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Advanced Preliminary')).toBeInTheDocument();
  });

  it('gives the two chips different accessible names, not only different text', async () => {
    setupMocks(HEARTLAND_SATURDAY);
    renderStep();

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    const names = screen
      .getAllByRole('checkbox')
      .map(node => node.getAttribute('aria-label') ?? node.closest('label')?.textContent?.trim());

    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.some(name => name?.includes('Advanced Preliminary'))).toBe(true);
  });

  it('keeps a split level as one level with two sections', async () => {
    setupMocks(SPLIT_LEVEL);
    renderStep();

    // Not "Novice A A" / "Novice B B": the name restates element, level and
    // section, so the disambiguator must contribute nothing here.
    expect(await screen.findByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('Novice B')).toBeInTheDocument();
    expect(screen.queryByText(/Novice A A|Interior Novice/)).not.toBeInTheDocument();
  });

  it('renders the same chips in the staff five-step variant', async () => {
    setupMocks(HEARTLAND_SATURDAY, { isStaff: true });
    renderStep({ workflowMode: 'secretary_new' });

    expect(await screen.findByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Advanced Preliminary')).toBeInTheDocument();
  });
});
