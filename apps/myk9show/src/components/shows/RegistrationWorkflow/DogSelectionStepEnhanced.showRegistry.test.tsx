/**
 * MYK9-619 — the STAFF dog picker (`DogSelectionStepEnhanced`, the mail-in
 * secretary path) must say which registration the show will use, exactly as
 * the exhibitor card has since MYK9-569. Before this, the row's Org / Reg #
 * cells showed `registrations[0]` whatever the show's registry was, so a UKC
 * number sat on the row of an AKC show.
 */
import { render, screen, within } from '@/test/utils/testUtils';
import { fromPartial } from '@total-typescript/shoehorn';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { UserRole } from '@/types/auth-types';
import type { Dog, Registration } from '@/types/dog-types';

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

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Live shape: `dog_registrations.organization` holds the LONG form on every
// row (LESSONS label-rule-vs-real-columns), never the bare abbreviation.
const registration = (overrides: Partial<Registration>): Registration => ({
  id: 'reg',
  organization: 'AKC (American Kennel Club)',
  registeredName: 'Champion Maple',
  breed: 'Golden Retriever',
  registrationNumber: 'SR12345601',
  status: 'Active',
  ...overrides,
});

const AKC = registration({ id: 'reg-akc' });
const UKC = registration({
  id: 'reg-ukc',
  organization: 'UKC (United Kennel Club)',
  registrationNumber: 'P987-654',
});
const ASCA = registration({
  id: 'reg-asca',
  organization: 'ASCA (Australian Shepherd Club of America)',
  registrationNumber: 'E123456',
});

const mockDog = (registrations: Registration[], registrationsReadComplete = true): Dog =>
  fromPartial<Dog>({
    id: 'dog-maple',
    name: 'Champion Maple',
    callName: 'Maple',
    breed: 'Golden Retriever',
    gender: 'Female',
    ownerId: 'person-1',
    dateOfBirth: '2020-01-01',
    status: 'active',
    registrations,
    registrationsReadComplete,
  });

const mountWith = (
  registrations: Registration[],
  showRegistryId: string | null,
  registrationsReadComplete = true
) => {
  mockUseDogStoreCompat.mockReturnValue({
    dogs: [mockDog(registrations, registrationsReadComplete)],
    isLoading: false,
  });
  const onSelectionChange = vi.fn();
  return {
    onSelectionChange,
    ...render(
      <DogSelectionStepEnhanced
        selectedDogs={[]}
        onSelectionChange={onSelectionChange}
        showRegistryId={showRegistryId}
      />
    ),
  };
};

const row = () => screen.getByRole('checkbox', { name: 'Select Maple' });
const usedMarker = () => row().querySelector('[data-registration-role="used"]');
const MISSING = /Add an AKC registration to enter this show/;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRegistrationPermissions.mockReturnValue({
    user: { id: 'user-1' },
    roles: [UserRole.SECRETARY],
    canBulkOperations: true,
    canCreateExhibitor: true,
    getMaxDogsPerRegistration: () => 50,
  });
  mockUseRegistrationContext.mockReturnValue({
    workflowConfig: { features: { advancedSearch: true, createNew: true } },
  });
});

describe('DogSelectionStepEnhanced — the registration this show will use', () => {
  it('shows and marks the AKC registration on an AKC show even when UKC is listed first', () => {
    // UKC FIRST: the old row read `registrations[0]`, so this ordering is what
    // put a UKC number on an AKC show's row.
    mountWith([UKC, AKC, ASCA], 'AKC');

    const marker = usedMarker();
    expect(marker).not.toBeNull();
    // Normalized for display — never the 27-character long form.
    expect(marker!.textContent).toBe('AKC');
    expect(within(row()).getByText('SR12345601')).toBeInTheDocument();
    expect(within(row()).queryByText('P987-654')).not.toBeInTheDocument();
    // The row is role="checkbox", whose children are presentational, so the
    // marker reaches a screen reader only through the row's description.
    expect(row()).toHaveAccessibleDescription('AKC: SR12345601, Used for this show');
    expect(within(row()).queryByText(MISSING)).not.toBeInTheDocument();
  });

  it('lists the used registration and the de-emphasized others in the row detail', async () => {
    const { user } = mountWith([UKC, AKC, ASCA], 'AKC');

    await user.hover(row());

    const used = await screen.findByText('Used for this show');
    expect(used.closest('[data-registration-role="used"]')!.textContent).toBe(
      'AKC: SR12345601, Used for this show'
    );
    const others = Array.from(document.querySelectorAll('[data-registration-role="other"]'));
    expect(others.map(node => node.textContent)).toEqual(['UKC: P987-654', 'ASCA: E123456']);
  });

  it('names the fix when the dog holds no AKC registration, without blocking selection', async () => {
    const { onSelectionChange, user } = mountWith([UKC, ASCA], 'AKC');

    expect(within(row()).getByText(MISSING)).toBeInTheDocument();
    expect(row()).toHaveAccessibleDescription('Add an AKC registration to enter this show');
    expect(usedMarker()).toBeNull();
    // Neither of the other registries' numbers stands in for the missing one.
    expect(within(row()).queryByText('P987-654')).not.toBeInTheDocument();

    // No selection block at this step: the per-trial guard in
    // ClassSelectionStep (with its conformation-puppy carve-out) owns that.
    expect(row()).not.toHaveAttribute('aria-disabled');
    await user.click(row());
    expect(onSelectionChange).toHaveBeenCalledWith(['dog-maple']);
  });

  it('claims nothing when the registration read did not complete', () => {
    mountWith([], 'AKC', false);

    expect(usedMarker()).toBeNull();
    expect(screen.queryByText(MISSING)).not.toBeInTheDocument();
    expect(row()).not.toHaveAccessibleDescription();
  });

  it('claims nothing while the show registry is unknown, and still labels the org short', () => {
    mountWith([UKC, AKC], null);

    expect(usedMarker()).toBeNull();
    expect(screen.queryByText(/registration to enter this show/)).not.toBeInTheDocument();
    // Fallback display: the first registration, normalized — not the regex
    // first-word slice that turned an unexpected string into garbage.
    expect(within(row()).getByText('UKC')).toBeInTheDocument();
    expect(within(row()).getByText('P987-654')).toBeInTheDocument();
  });
});
