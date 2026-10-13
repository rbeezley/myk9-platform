import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import DogDetailsMain from '../index';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import type { Dog } from '@/types/dog-types';

// 2026-10-12: a secretary could READ every dog (MYK9-854) and was offered Edit on all of
// them, but dogs_update refused the save for a dog she has no tie to, on every upload and
// every Retry. The page now asks the server's can_edit_dog() (the same rule) first.
const OWNER_PERSON_ID = '11111111-0000-4000-8000-0000000000a1';
const OTHER_PERSON_ID = '11111111-0000-4000-8000-0000000000a3';
const VIEWER_AUTH_UID = '99999999-0000-4000-8000-0000000000f1';

const dog: Dog = {
  id: 'dededede-0000-0000-0000-000000000041',
  name: 'Willow',
  callName: 'Willow',
  breed: 'Border Collie',
  sex: 'female',
  ownerId: OWNER_PERSON_ID,
  status: 'active',
};

let mockRoles: string[] = [];
let mockPersonId: string | undefined;
const rpc = vi.fn();

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) => selector({ people: [] }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isAdmin: false,
    userWithRoles: { id: VIEWER_AUTH_UID, databaseUserId: mockPersonId, scopes: [] },
    getUserRoles: () => mockRoles,
    hasRole: (role: string) => mockRoles.includes(role),
  }),
  getPrimaryRole: (roles: string[]) => (roles.includes('secretary') ? 'secretary' : 'exhibitor'),
}));
vi.mock('@/hooks/useValidatedClubContext', () => ({
  useCurrentValidatedClubContext: () => ({ status: 'loading' }),
}));
vi.mock('@/hooks/useRoleBasedData', () => ({ useCanDeleteDog: () => false }));
vi.mock('@/hooks/useBreadcrumb', () => ({ useBreadcrumb: () => [] }));
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useRegistrationsByDogQuery: () => ({ data: [], isLoading: false }),
  useDogRegistrationManagement: () => ({
    registrations: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({ isPremium: true, canAuthorizePremium: true, isLoading: false }),
}));
vi.mock('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection', () => ({
  default: () => null,
}));
vi.mock('../ActivityTab', () => ({ default: () => null }));
vi.mock('../TitleProgressSection', () => ({ default: () => null }));
vi.mock('../DogDialogs', () => ({ default: () => null }));
vi.mock('@/components/dogs/DogStatusDialog', () => ({ default: () => null }));
vi.mock('@/components/common/Breadcrumb', () => ({ default: () => <nav /> }));

const photoButton = () => screen.queryByRole('button', { name: 'Edit dog photo' });
const statusButton = () => screen.queryByRole('button', { name: /change status/i });
const pageTarget = () => usePageEditTargetStore.getState().target;

describe('DogDetailsMain — Edit, Change Photo and Change status follow dogs_update', () => {
  beforeEach(() => {
    rpc.mockReset();
    usePageEditTargetStore.setState({ owner: null, target: null });
    mockRoles = ['secretary'];
    mockPersonId = OTHER_PERSON_ID;
  });

  it('a secretary with no tie to the dog is offered none of the three', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    render(<DogDetailsMain dog={dog} />);

    await waitFor(() => expect(photoButton()).toBeNull());
    expect(rpc).toHaveBeenCalledWith('can_edit_dog', { p_dog_id: dog.id });
    // The status still shows, as a badge rather than a control.
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(statusButton()).toBeNull();
    expect(pageTarget()?.canEdit ?? false).toBe(false);
    expect(pageTarget()?.extras ?? []).toEqual([]);
  });

  it('a secretary the server lets edit (her show, or a dog she created) keeps all three', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    render(<DogDetailsMain dog={dog} />);

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Edit dog photo' })).toBeInTheDocument();
    expect(statusButton()).not.toBeNull();
    expect(pageTarget()?.canEdit).toBe(true);
    expect(pageTarget()?.extras.map(extra => extra.id)).toEqual(['photo', 'status']);
  });

  it('a check that fails (offline) keeps editing available; the server still decides', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    render(<DogDetailsMain dog={dog} />);

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Edit dog photo' })).toBeInTheDocument();
    expect(pageTarget()?.canEdit).toBe(true);
  });

  it('the owner never waits on the server', async () => {
    mockRoles = ['exhibitor'];
    mockPersonId = OWNER_PERSON_ID;
    render(<DogDetailsMain dog={dog} />);

    expect(await screen.findByRole('button', { name: 'Edit dog photo' })).toBeInTheDocument();
    expect(pageTarget()?.canEdit).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});
