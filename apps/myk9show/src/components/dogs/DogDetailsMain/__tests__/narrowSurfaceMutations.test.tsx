import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import DogDetailsMain from '../index';
import type { Dog } from '@/types/dog-types';

// Review round 3 (#2670): the narrow surface mounted the REAL registration list, whose
// Edit / Delete / "Edit registered name" controls the server refuses to a club admin.
// Unlike viewerRelationship.test.tsx, RegistrationsSection and RecordsSection are NOT mocked.
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
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

const registration = {
  id: 'r1',
  organization: 'AKC',
  registeredName: 'CH Willow Of Test',
  registrationNumber: 'SR123',
};
vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useRegistrationsByDogQuery: () => ({ data: [registration], isLoading: false }),
  useDogRegistrationManagement: () => ({
    registrations: [registration],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/components/dogs/DogDetails/Registrations/ManageRegistrationsPanel', () => ({
  default: () => <div data-testid="manage-registrations" />,
}));
vi.mock('@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs', () => ({
  default: () => <div data-testid="registration-dialogs" />,
}));
vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({ isPremium: true, canAuthorizePremium: true, isLoading: false }),
}));
// Health Records: capture the readOnly flag the narrow surface hands down.
vi.mock('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection', () => ({
  default: (props: { readOnly?: boolean; vaccinationsOnly?: boolean }) => (
    <div data-testid="health-records" data-read-only={String(props.readOnly)} />
  ),
}));
vi.mock('../ActivityTab', () => ({ default: () => null }));
vi.mock('../TitleProgressSection', () => ({ default: () => null }));
vi.mock('../DogDialogs', () => ({ default: () => null }));
vi.mock('@/components/dogs/DogStatusDialog', () => ({ default: () => null }));
vi.mock('@/components/common/Breadcrumb', () => ({ default: () => <nav /> }));


describe('DogDetailsMain narrow surface — registration and health mutations follow the server', () => {
  beforeEach(() => {
    mockRoles = [];
    mockPersonId = OTHER_PERSON_ID;
  });

  it.each([
    ['club admin only', ['club_admin']],
    ['club admin + exhibitor', ['club_admin', 'exhibitor']],
  ])('%s sees a read-only registration list with no mutation surfaces', async (_l, roles) => {
    mockRoles = roles;
    render(<DogDetailsMain dog={dog} />);
    expect(await screen.findByText('CH Willow Of Test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /registered name/i })).toBeNull();
    expect(screen.queryByTestId('registration-dialogs')).toBeNull();
    expect(screen.queryByTestId('manage-registrations')).toBeNull();
    expect(screen.queryByRole('button', { name: /add registration/i })).toBeNull();
    expect(document.querySelector('[data-dog-identity]')).not.toBeNull();
    expect(screen.getByTestId('health-records')).toHaveAttribute('data-read-only', 'true');
  });

  it('a secretary keeps the registration controls and dialogs', async () => {
    mockRoles = ['secretary'];
    render(<DogDetailsMain dog={dog} />);
    expect(
      await screen.findByRole('button', { name: /edit akc registered name/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId('registration-dialogs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add registration/i })).toBeInTheDocument();
    // Health vaccinations are owner / platform-admin writes, so read-only for a secretary too.
    expect(screen.getByTestId('health-records')).toHaveAttribute('data-read-only', 'true');
  });
});
