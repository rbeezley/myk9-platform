import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import DogDetailsMain from '../index';
import type { Dog } from '@/types/dog-types';
import { mapReplicatedDogToDbRow, mapDatabaseToDog } from '@/services/mappers/dogMappers';
import { useShowStore } from '@/store/showStore';
import { rowToDog } from '@/services/replication/ReplicatedDogsTable';

// MYK9-912: which dog-page surface renders depends on the viewer's RELATIONSHIP
// to the dog (owner / co-owner), not on their primary role alone. Person ids use
// the real shape: people.id is a UUID that is never the viewer's auth uid.
const OWNER_PERSON_ID = '11111111-0000-4000-8000-0000000000a1';
const CO_OWNER_PERSON_ID = '11111111-0000-4000-8000-0000000000a2';
const OTHER_PERSON_ID = '11111111-0000-4000-8000-0000000000a3';
const VIEWER_AUTH_UID = '99999999-0000-4000-8000-0000000000f1';

const baseDog: Dog = {
  id: 'dededede-0000-0000-0000-000000000041',
  name: 'Willow',
  callName: 'Willow',
  breed: 'Border Collie',
  sex: 'female',
  ownerId: OWNER_PERSON_ID,
  status: 'active',
};

let mockRoles: string[] = ['secretary'];
let mockPersonId: string | undefined;
let mockPeople: { id: string; user_id?: string }[] = [];
let mockIsAdmin = false;
let mockScopes: { scopeType: string; roleId: string; scopeId: string }[] = [];

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) =>
    selector({ people: mockPeople }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isAdmin: mockIsAdmin,
    userWithRoles: { id: VIEWER_AUTH_UID, databaseUserId: mockPersonId, scopes: mockScopes },
    getUserRoles: () => mockRoles,
    hasRole: (role: string) => mockRoles.includes(role),
  }),
  getPrimaryRole: (roles: string[]) => (roles.includes('secretary') ? 'secretary' : 'exhibitor'),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({ useCanDeleteDog: () => false }));
vi.mock('@/hooks/useBreadcrumb', () => ({ useBreadcrumb: () => [] }));
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useRegistrationsByDogQuery: () => ({ data: [], isLoading: false }),
  useDogRegistrationManagement: () => ({
    registrations: [],
    isLoading: false,
    error: null,
    createRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    deleteRegistration: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/components/dogs/DogDetails/Registrations/ManageRegistrationsPanel', () => ({
  default: () => <div data-testid="manage-registrations" />,
}));
vi.mock('@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs', () => ({
  default: () => null,
}));
vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({ isPremium: false, canAuthorizePremium: false, isLoading: false }),
}));
vi.mock('../ActivityTab', () => ({ default: () => <div>activity tab</div> }));
vi.mock('../TitleProgressSection', () => ({ default: () => null }));
vi.mock('../CareerSection', () => ({ default: () => <div>career section</div> }));
vi.mock('../RecordsSection', () => ({ default: () => <div>records section</div> }));
vi.mock('@/components/dogs/DogDetails/Registrations/RegistrationsSection', () => ({
  default: () => <div>registrations section</div>,
}));
vi.mock('../DogDialogs', () => ({ default: () => null }));
vi.mock('@/components/dogs/DogStatusDialog', () => ({ default: () => null }));
vi.mock('@/components/common/Breadcrumb', () => ({ default: () => <nav /> }));

const hasFullView = () =>
  ['Overview', 'Career', 'Records'].every(name => screen.queryByRole('tab', { name }) !== null);

/**
 * The dog as the page really receives it on the warm-replica path: a replicated
 * row (camelCase) through rowToDog-shaped input, mapReplicatedDogToDbRow, then
 * mapDatabaseToDog. Not a hand-built `{ ...baseDog, coOwnerId }`.
 */
const dogViaReplicaPath = (ownerId: string, coOwnerId?: string): Dog => {
  const replicated = rowToDog({
    id: baseDog.id,
    name: 'Willow',
    call_name: 'Willow',
    breed: 'Border Collie',
    sex: 'female',
    owner_id: ownerId,
    co_owner_id: coOwnerId ?? null,
  } as never);
  return mapDatabaseToDog(mapReplicatedDogToDbRow(replicated));
};

describe('DogDetailsMain — view follows the viewer’s relationship to the dog', () => {
  beforeEach(() => {
    mockRoles = ['secretary'];
    mockPersonId = undefined;
    mockPeople = [];
    mockIsAdmin = false;
    mockScopes = [];
    useShowStore.setState({ shows: [] });
  });

  it('gives a secretary who owns the dog the full exhibitor view', () => {
    mockRoles = ['secretary', 'exhibitor'];
    mockPersonId = OWNER_PERSON_ID;
    render(<DogDetailsMain dog={baseDog} />);
    expect(hasFullView()).toBe(true);
    expect(screen.getByRole('button', { name: 'Manage registrations' })).toBeInTheDocument();
  });

  it('carries co_owner_id through the replica read path', () => {
    expect(dogViaReplicaPath(OWNER_PERSON_ID, CO_OWNER_PERSON_ID).coOwnerId).toBe(
      CO_OWNER_PERSON_ID
    );
    expect(dogViaReplicaPath(OWNER_PERSON_ID).coOwnerId).toBeUndefined();
  });

  it('resolves the owner person through the people store when databaseUserId is not set', () => {
    mockRoles = ['secretary', 'exhibitor'];
    mockPeople = [{ id: OWNER_PERSON_ID, user_id: VIEWER_AUTH_UID }];
    render(<DogDetailsMain dog={baseDog} />);
    expect(hasFullView()).toBe(true);
  });

  it('gives a secretary who co-owns the dog the full exhibitor view', () => {
    mockRoles = ['secretary', 'exhibitor'];
    mockPersonId = CO_OWNER_PERSON_ID;
    render(<DogDetailsMain dog={dogViaReplicaPath(OWNER_PERSON_ID, CO_OWNER_PERSON_ID)} />);
    expect(hasFullView()).toBe(true);
  });

  it('keeps the narrow secretary surface for a secretary who does not own the dog', () => {
    mockRoles = ['secretary'];
    mockPersonId = OTHER_PERSON_ID;
    render(<DogDetailsMain dog={dogViaReplicaPath(OWNER_PERSON_ID, CO_OWNER_PERSON_ID)} />);
    expect(hasFullView()).toBe(false);
    expect(screen.getByText('registrations section')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage registrations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('does not treat the auth uid as a person id', () => {
    mockRoles = ['secretary'];
    mockPersonId = undefined;
    render(<DogDetailsMain dog={{ ...baseDog, ownerId: VIEWER_AUTH_UID }} />);
    expect(hasFullView()).toBe(false);
  });

  it('keeps the exhibitor view for a plain exhibitor', () => {
    mockRoles = ['exhibitor'];
    mockPersonId = OWNER_PERSON_ID;
    render(<DogDetailsMain dog={baseDog} />);
    expect(hasFullView()).toBe(true);
  });

  // MYK9-935: the narrow surface says where entries and results live.
  describe('non-owner secretary note', () => {
    const CLUB_A = '22222222-0000-4000-8000-0000000000c1';
    const CLUB_B = '22222222-0000-4000-8000-0000000000c2';
    const show = (id: string, clubId: string) => ({ id, clubId, name: `Show ${id}` }) as never;
    const asNonOwnerSecretary = (clubs: string[]) => {
      mockRoles = ['secretary'];
      mockPersonId = OTHER_PERSON_ID;
      mockScopes = clubs.map(scopeId => ({ scopeType: 'club', roleId: 'secretary', scopeId }));
    };
    const noteLink = () => screen.getByRole('link', { name: /Go to my shows/ });

    it('shows the note and a shows-list link by default', () => {
      asNonOwnerSecretary([CLUB_A]);
      render(<DogDetailsMain dog={baseDog} />);
      expect(screen.getByText('Entries and results live with each show.')).toBeInTheDocument();
      expect(noteLink()).toHaveAttribute('href', '/secretary/dashboard');
    });

    it('links straight to the Entries page when the viewer manages exactly one show', () => {
      asNonOwnerSecretary([CLUB_A]);
      useShowStore.setState({ shows: [show('s1', CLUB_A), show('s2', CLUB_B)] });
      render(<DogDetailsMain dog={baseDog} />);
      expect(noteLink()).toHaveAttribute('href', '/shows/s1/entries');
    });

    it('falls back to the shows list when the viewer manages several shows', () => {
      asNonOwnerSecretary([CLUB_A]);
      useShowStore.setState({ shows: [show('s1', CLUB_A), show('s3', CLUB_A)] });
      render(<DogDetailsMain dog={baseDog} />);
      expect(noteLink()).toHaveAttribute('href', '/secretary/dashboard');
    });

    it.each([
      ['owner secretary', ['secretary', 'exhibitor'], OWNER_PERSON_ID, false],
      ['plain exhibitor', ['exhibitor'], OTHER_PERSON_ID, false],
      ['site admin', ['site_admin'], OTHER_PERSON_ID, true],
    ])('does not show the note to a %s', (_label, roles, personId, admin) => {
      mockRoles = roles;
      mockPersonId = personId;
      mockIsAdmin = admin;
      render(<DogDetailsMain dog={baseDog} />);
      expect(screen.queryByText('Entries and results live with each show.')).toBeNull();
    });
  });
});
