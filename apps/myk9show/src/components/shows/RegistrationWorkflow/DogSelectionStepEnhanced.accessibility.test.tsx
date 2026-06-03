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

describe('DogSelectionStepEnhanced accessibility', () => {
  beforeEach(() => {
    mockUseDogStoreCompat.mockReturnValue({
      dogs: [
        {
          id: 'dog-ace',
          name: 'Ace',
          callName: 'Ace',
          ownerId: 'user-1',
          status: 'active',
          registrations: [
            {
              organization: 'AKC',
              registrationNumber: 'SW123',
              breed: 'Golden Retriever',
            },
          ],
        },
      ],
      isLoading: false,
    });
    mockUseRegistrationPermissions.mockReturnValue({
      user: { id: 'user-1' },
      roles: [UserRole.EXHIBITOR],
      canBulkOperations: false,
      canCreateExhibitor: false,
      getMaxDogsPerRegistration: () => 50,
    });
    mockUseRegistrationContext.mockReturnValue({
      workflowConfig: {
        features: {
          advancedSearch: false,
          createNew: false,
        },
      },
    });
  });

  it('names each dog checkbox by the dog it selects', () => {
    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Select Ace' })).toBeInTheDocument();
  });

  it('uses the checkbox as the single selected-state control for each dog row', () => {
    render(<DogSelectionStepEnhanced selectedDogs={['dog-ace']} onSelectionChange={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Select Ace' })).toBeChecked();
    expect(screen.queryByRole('button', { name: /Select Ace/ })).not.toBeInTheDocument();
  });
});
