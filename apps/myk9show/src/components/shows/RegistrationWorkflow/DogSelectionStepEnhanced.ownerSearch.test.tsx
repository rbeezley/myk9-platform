/**
 * MYK9-2020: the secretary's search box says it finds a dog by its owner's
 * name. Her local roster is capped, so a dog beyond it arrives only from the
 * system-wide search (`searchAllDogs`, which now matches the owner too); this
 * pins that such a dog, matched only by its owner, is listed.
 */
import { render, screen } from '@/test/utils/testUtils';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { UserRole } from '@/types/auth-types';
import { searchAllDogs } from '@/services/database/dogs';

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

vi.mock('@/components/shows/RegistrationWorkflow/CreatePersonForm', () => ({
  CreatePersonForm: () => null,
}));

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: () => null,
}));

vi.mock('@/services/database/dogs', () => ({
  SEARCH_ALL_DOGS_LIMIT: 25,
  searchAllDogs: vi.fn(),
}));

vi.mock('@/services/LoggingService', () => ({
  LoggingService: {
    getInstance: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    }),
  },
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('DogSelectionStepEnhanced search by owner name (MYK9-2020)', () => {
  beforeEach(() => {
    mockUseDogStoreCompat.mockReturnValue({
      dogs: [
        {
          id: 'dog-local',
          name: 'Local',
          callName: 'Local',
          ownerId: 'person-local',
          ownerName: 'Someone Else',
          status: 'active',
        },
      ],
      isLoading: false,
    });
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
    vi.mocked(searchAllDogs).mockResolvedValue({
      data: [
        {
          id: 'dog-far',
          name: 'Biscuit',
          call_name: 'Biscuit',
          owner_id: 'person-pat',
          status: 'active',
          owner: { id: 'person-pat', first_name: 'Pat', last_name: 'Mailer' },
          registrations: [],
        },
      ],
      error: null,
      hitLimit: false,
    });
  });

  it("lists a dog outside the local roster when the secretary types its owner's name", async () => {
    const { user } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );

    await user.type(screen.getByPlaceholderText(/by name, owner, breed/), 'pat mailer');

    expect(await screen.findByRole('checkbox', { name: 'Select Biscuit' })).toBeInTheDocument();
    expect(searchAllDogs).toHaveBeenLastCalledWith('pat mailer', 25, expect.anything());
    expect(screen.queryByRole('checkbox', { name: 'Select Local' })).not.toBeInTheDocument();
  });

  it('says the list is cut short when the search reports truncation, even with few dogs', async () => {
    vi.mocked(searchAllDogs).mockResolvedValue({
      data: [
        {
          id: 'dog-far',
          name: 'Biscuit',
          call_name: 'Biscuit',
          owner_id: 'person-pat',
          status: 'active',
          owner: { id: 'person-pat', first_name: 'Pat', last_name: 'Mailer' },
          registrations: [],
        },
      ],
      error: null,
      hitLimit: true,
    });
    const { user } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );

    await user.type(screen.getByPlaceholderText(/by name, owner, breed/), 'pat');

    expect(await screen.findByText(/refine your search for more/)).toBeInTheDocument();
  });
});
