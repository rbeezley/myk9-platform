/**
 * Tests for ClassSelectionStep expandedTrials delayed hydration fix (Issue 16).
 *
 * Verifies that when replication delivers trial data after mount (empty → populated),
 * the trials are auto-expanded and existing expansions are not collapsed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@/test/utils/testUtils';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockUseTrialStore,
  mockUseDogStoreCompat,
  mockUseShowStore,
  mockUseCartStore,
  mockUseCartItems,
  mockUseAuthContext,
  mockUseExhibitorProfile,
  mockUseExistingEntries,
  mockUseClassAvailability,
} = vi.hoisted(() => ({
  mockUseTrialStore: vi.fn(),
  mockUseDogStoreCompat: vi.fn(),
  mockUseShowStore: vi.fn(),
  mockUseCartStore: vi.fn(),
  mockUseCartItems: vi.fn(),
  mockUseAuthContext: vi.fn(),
  mockUseExhibitorProfile: vi.fn(),
  mockUseExistingEntries: vi.fn(),
  mockUseClassAvailability: vi.fn(),
}));

vi.mock('@/store/trialStore', () => ({ useTrialStore: mockUseTrialStore }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: mockUseDogStoreCompat }));
vi.mock('@/store/showStore', () => ({ useShowStore: mockUseShowStore }));
vi.mock('@/stores/cartStore', () => ({
  useCartStore: mockUseCartStore,
  useCartItems: mockUseCartItems,
}));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mockUseAuthContext }));
vi.mock('@/hooks/useExhibitorProfile', () => ({ useExhibitorProfile: mockUseExhibitorProfile }));
vi.mock('@/hooks/useExistingEntries', () => ({ useExistingEntries: mockUseExistingEntries }));
vi.mock('@/hooks/useClassAvailability', () => ({
  useClassAvailability: mockUseClassAvailability,
}));
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

// ─── Constants ─────────────────────────────────────────────────────────────────

const SHOW_ID = 'show-expand-1';
const DOG_ID = 'dog-expand-1';
const TRIAL_ID_A = 'trial-a';
const TRIAL_ID_B = 'trial-b';
const CLASS_ID_A = 'class-a';
const CLASS_ID_B = 'class-b';

// ─── Mock setup helpers ─────────────────────────────────────────────────────────

function makeTrialStoreState(trialIds: string[]) {
  const trials = trialIds.map((id, i) => ({
    id,
    showId: SHOW_ID,
    name: `Trial ${i + 1}`,
    trialType: 'Nosework',
    order: String(i + 1),
    trialDate: `2026-05-0${i + 1}`,
  }));
  const trialClasses: Record<string, unknown[]> = {};
  trialIds.forEach((id, i) => {
    trialClasses[id] = [
      {
        id: i === 0 ? CLASS_ID_A : CLASS_ID_B,
        element: 'Container',
        level: 'Novice',
        section: 'A',
        trial_id: id,
      },
    ];
  });
  return { trials, trialClasses };
}

function setupBaseMocks(trialIds: string[]) {
  const state = makeTrialStoreState(trialIds);

  mockUseTrialStore.mockImplementation((selector: (s: unknown) => unknown) => selector(state));
  mockUseDogStoreCompat.mockReturnValue({
    dogs: [{ id: DOG_ID, name: 'Buddy', callName: 'Buddy', registrations: [] }],
  });
  mockUseShowStore.mockReturnValue({
    shows: [{ id: SHOW_ID, name: 'Test Show', preEntryFee: '15', startDate: '2026-06-01' }],
  });
  mockUseCartItems.mockReturnValue([]);
  mockUseCartStore.mockImplementation((selector: (s: unknown) => unknown) => {
    const s = {
      cart: null,
      loadCart: vi.fn().mockResolvedValue(null),
      createCart: vi.fn().mockResolvedValue(null),
      addItem: vi.fn().mockResolvedValue(true),
      removeItem: vi.fn().mockResolvedValue(true),
    };
    return selector(s);
  });
  mockUseAuthContext.mockReturnValue({ isSecretary: false, isAdmin: false, user: null });
  mockUseExhibitorProfile.mockReturnValue({ profile: null });
  mockUseExistingEntries.mockReturnValue({
    getExistingEntry: vi.fn().mockReturnValue(undefined),
    getEntriesForDog: vi.fn().mockReturnValue([]),
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

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ClassSelectionStep — expandedTrials delayed hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseMocks([]);
  });

  it('auto-expands trials when they load after mount (empty → populated)', async () => {
    // Mount with no trials (replication not yet delivered)
    const { rerender } = render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={vi.fn()}
        showId={SHOW_ID}
      />
    );

    // No trial headers visible yet
    expect(screen.queryByText('Trial 1')).not.toBeInTheDocument();

    // Simulate replication delivering trials
    const state = makeTrialStoreState([TRIAL_ID_A]);
    mockUseTrialStore.mockImplementation((selector: (s: unknown) => unknown) => selector(state));

    await act(async () => {
      rerender(
        <ClassSelectionStep
          selectedDogs={[DOG_ID]}
          classSelections={[]}
          onSelectionChange={vi.fn()}
          showId={SHOW_ID}
        />
      );
    });

    // Trial section should now be rendered and expanded (classes visible)
    expect(await screen.findByText('Container')).toBeInTheDocument();
  });

  it('does not collapse already-expanded trials when new trials are added', async () => {
    // Mount with one trial already loaded
    setupBaseMocks([TRIAL_ID_A]);
    const { rerender } = render(
      <ClassSelectionStep
        selectedDogs={[DOG_ID]}
        classSelections={[]}
        onSelectionChange={vi.fn()}
        showId={SHOW_ID}
      />
    );

    // First trial's class should be visible (expanded by default)
    expect(await screen.findByText('Container')).toBeInTheDocument();

    // Simulate a second trial arriving
    const state = makeTrialStoreState([TRIAL_ID_A, TRIAL_ID_B]);
    mockUseTrialStore.mockImplementation((selector: (s: unknown) => unknown) => selector(state));

    await act(async () => {
      rerender(
        <ClassSelectionStep
          selectedDogs={[DOG_ID]}
          classSelections={[]}
          onSelectionChange={vi.fn()}
          showId={SHOW_ID}
        />
      );
    });

    // Original trial classes should still be visible (not collapsed)
    const containerEls = screen.getAllByText('Container');
    expect(containerEls.length).toBeGreaterThanOrEqual(1);
  });
});
