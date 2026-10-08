import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { getUnderMinAgeDobWarning } from '@/utils/dogDobCheck';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';

// Both creation paths (direct Add Dog, and Quick Create's nested Add Dog) must
// judge a DOB against the SAME date. Each stub applies the real warning rule to
// the showStartDate it was handed (MYK9-1060 review).
const PUP_DOB = '2026-06-01';
const decision = (showStartDate?: string) =>
  getUnderMinAgeDobWarning(PUP_DOB, 'Pup', showStartDate) ?? 'no warning';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [], isLoading: false }),
}));
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
vi.mock('@/components/shows/RegistrationWorkflow/CreateExhibitorDialog', () => ({
  CreateExhibitorDialog: () => null,
}));
vi.mock('@/components/shows/RegistrationWorkflow/QuickCreateFlow', () => ({
  QuickCreateFlow: (props: { showStartDate?: string }) => (
    <div data-testid="quick-create">{decision(props.showStartDate)}</div>
  ),
}));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: { showStartDate?: string }) => (
    <div data-testid="direct-add-dog">{decision(props.showStartDate)}</div>
  ),
}));
vi.mock('@/services/database/dogs', () => ({ SEARCH_ALL_DOGS_LIMIT: 25, searchAllDogs: vi.fn() }));

describe('DogSelectionStepEnhanced show start date', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives both dog-creation paths the same warning decision for the same DOB and show date', () => {
    render(
      <DogSelectionStepEnhanced
        selectedDogs={[]}
        onSelectionChange={vi.fn()}
        showStartDate="2026-12-15"
      />
    );
    // A June pup is 6+ months old by the Dec 15 show: no warning on either path.
    expect(screen.getByTestId('direct-add-dog')).toHaveTextContent('no warning');
    expect(screen.getByTestId('quick-create')).toHaveTextContent('no warning');
  });
});
