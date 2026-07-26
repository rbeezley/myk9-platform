import { useEffect } from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { UserRole } from '@/types/auth-types';

const mockUseDogStoreCompat = vi.fn();
const mockUseRegistrationPermissions = vi.fn();
const mockUseRegistrationContext = vi.fn();

// Counts how many times AddDogPanel mounts. A remount is what wipes the
// in-progress wizard (tab resets to "basic", form fields clear), so the mount
// count is the assertion that matters — not merely "is it in the document".
const addDogPanelMounts = vi.fn();

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
  AddDogPanel: () => {
    useEffect(() => {
      addDogPanelMounts();
    }, []);
    return <div data-testid="add-dog-panel" />;
  },
}));

vi.mock('@/services/database/dogs', () => ({
  SEARCH_ALL_DOGS_LIMIT: 25,
  searchAllDogs: vi.fn(),
}));

vi.mock('@/services/LoggingService', () => ({
  LoggingService: {
    getInstance: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  },
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const DOGS = [
  {
    id: 'dog-ace',
    name: 'Ace',
    callName: 'Ace',
    ownerId: 'user-1',
    status: 'active',
    registrations: [
      { organization: 'AKC', registrationNumber: 'SW123', breed: 'Golden Retriever' },
    ],
  },
];

describe('DogSelectionStepEnhanced dialog persistence', () => {
  beforeEach(() => {
    addDogPanelMounts.mockClear();
    mockUseDogStoreCompat.mockReturnValue({ dogs: DOGS, isLoading: false });
    mockUseRegistrationPermissions.mockReturnValue({
      user: { id: 'user-1' },
      roles: [UserRole.EXHIBITOR],
      canBulkOperations: false,
      canCreateExhibitor: true,
      getMaxDogsPerRegistration: () => 50,
    });
    mockUseRegistrationContext.mockReturnValue({
      workflowConfig: { features: { advancedSearch: false, createNew: true } },
    });
  });

  // The dog list re-enters its loading state on its own schedule — the RBAC
  // poll can mint a new useDogsQuery cache key, and useDogStoreCompat folds
  // createMutation.isPending into the same isLoading flag. None of that may
  // tear down an Add Dog wizard the user is partway through filling in.
  it('keeps the Add Dog panel mounted when the dog list re-enters loading', () => {
    const { rerender } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );

    expect(screen.getByTestId('add-dog-panel')).toBeInTheDocument();
    expect(addDogPanelMounts).toHaveBeenCalledTimes(1);

    mockUseDogStoreCompat.mockReturnValue({ dogs: DOGS, isLoading: true });
    rerender(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);

    expect(screen.getByTestId('add-dog-panel')).toBeInTheDocument();
    expect(addDogPanelMounts).toHaveBeenCalledTimes(1);
  });

  // Saving the first dog flips the list from "one dog" to whatever the refetch
  // returns; the zero-dog empty state must not tear the wizard down either.
  it('keeps the Add Dog panel mounted when the accessible dog list empties', () => {
    const { rerender } = render(
      <DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />
    );

    expect(addDogPanelMounts).toHaveBeenCalledTimes(1);

    mockUseDogStoreCompat.mockReturnValue({ dogs: [], isLoading: false });
    rerender(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);

    expect(screen.getByTestId('add-dog-panel')).toBeInTheDocument();
    expect(addDogPanelMounts).toHaveBeenCalledTimes(1);
  });
});
