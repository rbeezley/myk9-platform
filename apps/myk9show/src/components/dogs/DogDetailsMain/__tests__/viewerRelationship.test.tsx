import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import DogDetailsMain from '../index';
import type { Dog } from '@/types/dog-types';

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

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) =>
    selector({ people: mockPeople }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { id: VIEWER_AUTH_UID, databaseUserId: mockPersonId },
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
vi.mock('../DogDetailsTabs', () => ({
  default: ({ role }: { role?: string }) => <div data-testid="dog-tabs" data-role={role} />,
}));
vi.mock('../DogDialogs', () => ({ default: () => null }));
vi.mock('@/components/dogs/DogStatusDialog', () => ({ default: () => null }));
vi.mock('@/components/common/Breadcrumb', () => ({ default: () => <nav /> }));

const tabsRole = () => screen.getByTestId('dog-tabs').getAttribute('data-role');

describe('DogDetailsMain — view follows the viewer’s relationship to the dog', () => {
  beforeEach(() => {
    mockRoles = ['secretary'];
    mockPersonId = undefined;
    mockPeople = [];
  });

  it('gives a secretary who owns the dog the full exhibitor view', () => {
    mockRoles = ['secretary', 'exhibitor'];
    mockPersonId = OWNER_PERSON_ID;
    render(<DogDetailsMain dog={baseDog} />);
    expect(tabsRole()).toBe('exhibitor');
    expect(screen.getByTestId('manage-registrations')).toBeInTheDocument();
  });

  it('resolves the owner person through the people store when databaseUserId is not set', () => {
    mockRoles = ['secretary', 'exhibitor'];
    mockPeople = [{ id: OWNER_PERSON_ID, user_id: VIEWER_AUTH_UID }];
    render(<DogDetailsMain dog={baseDog} />);
    expect(tabsRole()).toBe('exhibitor');
  });

  it('gives a secretary who co-owns the dog the full exhibitor view', () => {
    mockRoles = ['secretary', 'exhibitor'];
    mockPersonId = CO_OWNER_PERSON_ID;
    render(<DogDetailsMain dog={{ ...baseDog, coOwnerId: CO_OWNER_PERSON_ID }} />);
    expect(tabsRole()).toBe('exhibitor');
  });

  it('keeps the narrow secretary surface for a secretary who does not own the dog', () => {
    mockRoles = ['secretary'];
    mockPersonId = OTHER_PERSON_ID;
    render(<DogDetailsMain dog={{ ...baseDog, coOwnerId: CO_OWNER_PERSON_ID }} />);
    expect(tabsRole()).toBe('secretary');
    expect(screen.queryByTestId('manage-registrations')).not.toBeInTheDocument();
  });

  it('does not treat the auth uid as a person id', () => {
    mockRoles = ['secretary'];
    mockPersonId = undefined;
    render(<DogDetailsMain dog={{ ...baseDog, ownerId: VIEWER_AUTH_UID }} />);
    expect(tabsRole()).toBe('secretary');
  });

  it('keeps the exhibitor view for a plain exhibitor', () => {
    mockRoles = ['exhibitor'];
    mockPersonId = OWNER_PERSON_ID;
    render(<DogDetailsMain dog={baseDog} />);
    expect(tabsRole()).toBe('exhibitor');
  });
});
