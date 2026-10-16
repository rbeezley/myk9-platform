/**
 * The data-layer spies the real-component Quick Create tests share (MYK9-1081).
 * Each test file wires them with `vi.mock(path, () => import('./quickCreateFlowMocks')…)`
 * so the forms render for real and only the persistence seams are faked. Keep
 * this module free of app imports: a mock factory that imports the app back
 * would deadlock module resolution.
 */
import type { ReactNode } from 'react';
import { vi } from 'vitest';

export const quickCreateMocks = {
  createUser: vi.fn(),
  createPerson: vi.fn(),
  getPendingMutationIdsForRow: vi.fn(),
  addDog: vi.fn(),
  addDogOfflineFirst: vi.fn(),
  updateUser: vi.fn(),
  updateDog: vi.fn(),
  recordOwnerCreated: vi.fn(),
  recordDogCreated: vi.fn(),
  refreshOwnerCreated: vi.fn(),
  refreshDogCreated: vi.fn(),
};

export const usersModule = {
  createUser: quickCreateMocks.createUser,
  updateUser: quickCreateMocks.updateUser,
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
};

export const showDeskPeopleModule = {
  replicatedShowDeskPeopleTable: {
    createPerson: quickCreateMocks.createPerson,
    getPendingMutationIdsForRow: quickCreateMocks.getPendingMutationIdsForRow,
  },
};

export const dogStoreModule = {
  useDogStoreCompat: () => ({
    addDog: quickCreateMocks.addDog,
    addDogOfflineFirst: quickCreateMocks.addDogOfflineFirst,
    updateDog: quickCreateMocks.updateDog,
    dogs: [],
    isLoading: false,
    error: null,
  }),
};

export const createdInSessionModule = {
  useCreatedInSession: () => ({
    created: { owners: [], dogs: [] },
    recordOwnerCreated: quickCreateMocks.recordOwnerCreated,
    recordDogCreated: quickCreateMocks.recordDogCreated,
    refreshOwnerCreated: quickCreateMocks.refreshOwnerCreated,
    refreshDogCreated: quickCreateMocks.refreshDogCreated,
  }),
};

// The breed picker's popover renders inline, as the registration form
// tests already do, so jsdom never fights floating-ui. A side effect worth
// knowing: a mocked popover carries no role="dialog", so counting dialogs stays
// honest while the breed list is on screen.
export const popoverModule = {
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
};

/** Seeds the default online and offline save results. Call from `beforeEach`. */
export function resetQuickCreateMocks() {
  Object.values(quickCreateMocks).forEach(mock => mock.mockReset());
  quickCreateMocks.createUser.mockResolvedValue({
    data: { id: 'person-1', first_name: 'Molly', last_name: 'Mailbox', email: null },
    error: null,
  });
  quickCreateMocks.createPerson.mockResolvedValue({
    id: 'person-1',
    firstName: 'Molly',
    lastName: 'Mailbox',
    email: null,
    phone: null,
    address: null,
    city: null,
    state: null,
    zipCode: null,
  });
  quickCreateMocks.getPendingMutationIdsForRow.mockResolvedValue(['person-mutation-1']);
  const savedDog = {
    id: 'dog-1',
    name: 'Ziggy',
    callName: 'Ziggy',
    gender: 'Male',
    dateOfBirth: '2020-01-01',
    registrations: [],
  };
  quickCreateMocks.addDog.mockResolvedValue(savedDog);
  quickCreateMocks.addDogOfflineFirst.mockResolvedValue(savedDog);
  quickCreateMocks.updateUser.mockResolvedValue({
    data: { id: 'person-1', first_name: 'Molly', last_name: 'Mailbox', email: null },
    error: null,
  });
  quickCreateMocks.updateDog.mockImplementation(async (_id: string, updates: object) => ({
    ...savedDog,
    ...updates,
  }));
}
