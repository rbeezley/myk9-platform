/**
 * MYK9-485 review round 1. Staff workflows (`advancedSearch: true`) route to
 * this component, not `DogSelectionStep`, so the de-duplication fix had to be
 * applied here too — a secretary was reading "Registered Name: Maple" in the
 * tooltip of a row that already says Maple.
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

const registration = {
  organization: 'AKC',
  registrationNumber: 'SW123',
  breed: 'Golden Retriever',
  isPrimary: true,
};

describe('DogSelectionStepEnhanced registered-name tooltip', () => {
  beforeEach(() => {
    mockUseDogStoreCompat.mockReturnValue({
      dogs: [
        {
          id: 'dog-maple',
          name: 'MAPLE',
          callName: 'MAPLE',
          ownerId: 'user-1',
          status: 'active',
          dateOfBirth: '2021-09-30',
          registrations: [{ ...registration, registeredName: ' maple ' }],
        },
        {
          id: 'dog-juni',
          name: 'Juni',
          callName: 'Juni',
          ownerId: 'user-1',
          status: 'active',
          dateOfBirth: '2022-05-20',
          registrations: [{ ...registration, registeredName: 'Juniper' }],
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
      workflowConfig: {
        features: {
          advancedSearch: true,
          createNew: true,
        },
      },
    });
  });

  it('shows the registered name only when it differs from the call name', async () => {
    const { user } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );

    // Positive control FIRST: a genuinely different registered name must reach
    // the tooltip, or the suppression assertion below proves nothing.
    await user.hover(screen.getByRole('checkbox', { name: 'Select Juni' }));
    expect(await screen.findByText('Juniper')).toBeInTheDocument();
    expect(screen.getAllByText('Registered Name').length).toBeGreaterThan(0);

    await user.unhover(screen.getByRole('checkbox', { name: 'Select Juni' }));

    // Same name up to case and padding: the row already says it once.
    await user.hover(screen.getByRole('checkbox', { name: 'Select MAPLE' }));
    // The tooltip still opens (it carries the date of birth), so its absence is
    // not what is being measured here.
    expect(await screen.findByText('9/30/2021')).toBeInTheDocument();
    expect(screen.queryByText('Registered Name')).not.toBeInTheDocument();
  });
});
