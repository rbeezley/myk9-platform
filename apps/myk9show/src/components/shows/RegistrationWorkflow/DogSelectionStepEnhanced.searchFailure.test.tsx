/**
 * MYK9-90 review round 3 — caller-level proof that a FAILED system-wide dog
 * search is distinguishable from a search that found nothing.
 *
 * `searchAllDogs` resolves with `{ data: [], error }` instead of rejecting, so
 * a `.then` that only destructures `data`/`hitLimit` silently turns a backend
 * outage into "no dogs found". A secretary who believes that will create a
 * duplicate dog record. These tests drive the component, not the service.
 */

import { render, screen, waitFor, fireEvent } from '@/test/utils/testUtils';
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
  SEARCH_ALL_DOGS_LIMIT: 25,
  searchAllDogs: vi.fn(),
}));

vi.mock('@/services/LoggingService', () => ({
  LoggingService: {
    getInstance: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  },
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockSearchAllDogs = vi.mocked(searchAllDogs);

/** Secretary-shaped context: advancedSearch on, so the server search runs. */
function setUp({ localDogs = [] }: { localDogs?: unknown[] } = {}) {
  mockUseDogStoreCompat.mockReturnValue({ dogs: localDogs, isLoading: false });
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
}

function typeSearch(text: string) {
  const input = screen.getByPlaceholderText(/Search all dogs/i);
  fireEvent.change(input, { target: { value: text } });
}

describe('DogSelectionStepEnhanced — system-wide search failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a distinguishable failure alert when the search errors', async () => {
    setUp();
    // The real service RESOLVES on failure — this is the shape under test.
    mockSearchAllDogs.mockResolvedValue({
      data: [],
      error: { message: 'PostgREST unavailable' },
      hitLimit: false,
    } as unknown as Awaited<ReturnType<typeof searchAllDogs>>);

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    typeSearch('ranger');

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent(/search is unavailable/i);
    // The critical assertion: it must NOT read as "no such dog".
    expect(screen.queryByText(/No dogs match your search/i)).not.toBeInTheDocument();
  });

  it('shows the ordinary empty state — and no alert — when the search succeeds with no matches', async () => {
    setUp();
    mockSearchAllDogs.mockResolvedValue({
      data: [],
      error: null,
      hitLimit: false,
    } as unknown as Awaited<ReturnType<typeof searchAllDogs>>);

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    typeSearch('ranger');

    await waitFor(() => expect(mockSearchAllDogs).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('still warns when local dogs match, because the server list is silently incomplete', async () => {
    // The dangerous case: results look healthy, so nothing signals the outage
    // unless the alert renders outside the results/empty branch.
    setUp({
      localDogs: [
        {
          id: 'dog-ace',
          name: 'Ace',
          callName: 'Ace',
          ownerId: 'user-1',
          status: 'active',
          registrations: [],
        },
      ],
    });
    mockSearchAllDogs.mockResolvedValue({
      data: [],
      error: { message: 'PostgREST unavailable' },
      hitLimit: false,
    } as unknown as Awaited<ReturnType<typeof searchAllDogs>>);

    render(<DogSelectionStepEnhanced selectedDogs={[]} onSelectionChange={vi.fn()} />);
    typeSearch('ace');

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent(/only dogs already loaded on this device/i);
  });
});
