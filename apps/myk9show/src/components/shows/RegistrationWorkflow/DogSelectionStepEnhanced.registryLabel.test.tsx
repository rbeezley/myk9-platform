/**
 * MYK9-736 — the staff dog picker named "AKC number" on every show. A show has
 * exactly one registry, so a UKC or ASCA show must name its own number, and a
 * show whose registry is not known yet must not guess.
 *
 * Both searches match any registration number: the local filter reads every
 * `registrations[].registrationNumber`, and `searchAllDogs` ilikes
 * `dog_registrations.registration_number` with no registry predicate.
 */

import { render, screen } from '@/test/utils/testUtils';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { UserRole } from '@/types/auth-types';

const mockUseDogStoreCompat = vi.fn();
const mockUseRegistrationPermissions = vi.fn();
const mockUseRegistrationContext = vi.fn();

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => mockUseDogStoreCompat(),
}));

vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => mockUseRegistrationPermissions(),
}));

vi.mock('@/hooks/useRegistrationContext', () => ({
  useRegistrationContext: () => mockUseRegistrationContext(),
}));

vi.mock('@/components/shows/RegistrationWorkflow/QuickCreateFlow', () => ({
  QuickCreateFlow: () => null,
}));

vi.mock('@/components/shows/RegistrationWorkflow/CreateExhibitorDialog', () => ({
  CreateExhibitorDialog: () => null,
}));

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: () => null,
}));

vi.mock('@/services/database/dogs', () => ({
  SEARCH_ALL_DOGS_LIMIT: 25,
  searchAllDogs: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseDogStoreCompat.mockReturnValue({ dogs: [], isLoading: false });
  mockUseRegistrationPermissions.mockReturnValue({
    user: { id: 'user-1' },
    roles: [UserRole.SITE_ADMIN],
    canBulkOperations: true,
    canCreateExhibitor: true,
    getMaxDogsPerRegistration: () => 50,
  });
  mockUseRegistrationContext.mockReturnValue({
    workflowConfig: { features: { advancedSearch: true, createNew: true } },
  });
});

describe('DogSelectionStepEnhanced — registration-number wording follows the show registry', () => {
  it.each([
    ['AKC', 'AKC number'],
    ['UKC', 'UKC number'],
    ['ASCA', 'ASCA number'],
    [null, 'registration number'],
    [undefined, 'registration number'],
  ])('show registry %s reads "%s"', (showRegistryId, expected) => {
    render(
      <DogSelectionStepEnhanced
        selectedDogs={[]}
        onSelectionChange={vi.fn()}
        showRegistryId={showRegistryId}
      />
    );

    const search = screen.getByPlaceholderText(/^Search all dogs by name, breed, or /);
    expect(search).toHaveAttribute(
      'placeholder',
      `Search all dogs by name, breed, or ${expected}...`
    );
    expect(
      screen.getByText(`Search by name, breed, or ${expected} to find a dog to register.`)
    ).toBeInTheDocument();

    // No other registry's name may leak into the picker's copy.
    const others = ['AKC', 'UKC', 'ASCA'].filter(id => !expected.startsWith(id));
    for (const other of others) {
      expect(search.getAttribute('placeholder')).not.toContain(other);
      expect(screen.queryByText(new RegExp(`\\b${other} number\\b`))).not.toBeInTheDocument();
    }
  });
});
