import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
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

vi.mock('@/components/shows/RegistrationWorkflow/CreateExhibitorDialog', () => ({
  CreateExhibitorDialog: () => null,
}));

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: () => null,
}));

vi.mock('@/services/database/dogs', () => ({
  SEARCH_ALL_DOGS_LIMIT: 50,
  searchAllDogs: vi.fn(),
}));

vi.mock('@/services/LoggingService', () => ({
  LoggingService: {
    getInstance: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  },
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockSearchAllDogs = vi.mocked(searchAllDogs);

function dog(id: string, name: string) {
  return {
    id,
    name,
    callName: name,
    ownerId: `owner-${id}`,
    status: 'active',
    registrations: [],
  };
}

function setUp() {
  mockUseDogStoreCompat.mockReturnValue({ dogs: [], isLoading: false });
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
}

function typeSearch(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/Search all dogs/i), { target: { value } });
}

describe('DogSelectionStepEnhanced search freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUp();
  });

  it('keeps the newer filtered rows when the older response resolves last', async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof searchAllDogs>>) => void;
    let resolveNew!: (value: Awaited<ReturnType<typeof searchAllDogs>>) => void;
    mockSearchAllDogs
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveNew = resolve;
          })
      );

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    typeSearch(' OLD ');
    await waitFor(
      () => expect(mockSearchAllDogs.mock.calls.some(call => call[0] === 'old')).toBe(true),
      {
        timeout: 1500,
      }
    );

    typeSearch('new');
    await waitFor(
      () => expect(mockSearchAllDogs.mock.calls.some(call => call[0] === 'new')).toBe(true),
      {
        timeout: 1500,
      }
    );

    resolveNew({ data: [dog('new-dog', 'New Dog')], error: null, hitLimit: false });
    expect(await screen.findByRole('checkbox', { name: 'Select New Dog' })).toBeInTheDocument();

    resolveOld({ data: [dog('old-dog', 'Old Dog')], error: null, hitLimit: false });
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Select New Dog' })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Select Old Dog' })).not.toBeInTheDocument();
    });
  });

  it('does not keep the previous rows visible while a newer search is pending', async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof searchAllDogs>>) => void;
    mockSearchAllDogs
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValue({ data: [], error: null, hitLimit: false });

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    typeSearch('old');
    await waitFor(
      () => expect(mockSearchAllDogs.mock.calls.some(call => call[0] === 'old')).toBe(true),
      {
        timeout: 1500,
      }
    );
    resolveOld({ data: [dog('old-dog', 'Old Dog')], error: null, hitLimit: false });
    expect(await screen.findByRole('checkbox', { name: 'Select Old Dog' })).toBeInTheDocument();

    typeSearch('new');

    expect(screen.queryByRole('checkbox', { name: 'Select Old Dog' })).not.toBeInTheDocument();
  });

  it('clears filtered rows immediately when the search is cleared', async () => {
    mockSearchAllDogs.mockResolvedValue({
      data: [dog('old-dog', 'Old Dog')],
      error: null,
      hitLimit: false,
    });

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    typeSearch('old');
    await waitFor(
      () => expect(mockSearchAllDogs.mock.calls.some(call => call[0] === 'old')).toBe(true),
      {
        timeout: 1500,
      }
    );
    expect(await screen.findByRole('checkbox', { name: 'Select Old Dog' })).toBeInTheDocument();

    typeSearch('');

    expect(screen.queryByRole('checkbox', { name: 'Select Old Dog' })).not.toBeInTheDocument();
  });

  it('does not surface a superseded request cancellation as a search error', async () => {
    let rejectOld!: (reason: unknown) => void;
    mockSearchAllDogs
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOld = reject;
          })
      )
      .mockResolvedValue({ data: [], error: null, hitLimit: false });

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    typeSearch('old');
    await waitFor(
      () => expect(mockSearchAllDogs.mock.calls.some(call => call[0] === 'old')).toBe(true),
      {
        timeout: 1500,
      }
    );

    typeSearch('new');
    await waitFor(
      () => expect(mockSearchAllDogs.mock.calls.some(call => call[0] === 'new')).toBe(true),
      {
        timeout: 1500,
      }
    );
    rejectOld(new DOMException('The operation was aborted.', 'AbortError'));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByText(/search is unavailable/i)).not.toBeInTheDocument();
  });
});
