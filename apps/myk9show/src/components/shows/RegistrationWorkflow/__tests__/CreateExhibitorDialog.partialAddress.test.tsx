/**
 * MYK9-931 (Codex round 5): a mail-in paper entry may carry only a ZIP or only a
 * street. In CREATE mode every address part is optional and independent; the
 * "any address part needs city and state" rule stays an EDIT-mode rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { fromAny } from '@total-typescript/shoehorn';
import { createUser } from '@/services/database/users';
import { useUserStore } from '@/store/userStore';
import { CreateExhibitorDialog } from '../CreateExhibitorDialog';
import {
  userFormSchema,
  userCreateFormSchema,
} from '@/components/panels/edit/UserEditPanel.helpers';

const { mockCreatePerson, mockPending } = vi.hoisted(() => ({
  mockCreatePerson: vi.fn(),
  mockPending: vi.fn(),
}));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  createUser: vi.fn(),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: {
    createPerson: mockCreatePerson,
    getPendingMutationIdsForRow: mockPending,
  },
}));

const createUserMock = vi.mocked(createUser);

async function addPerson(
  user: ReturnType<typeof userEvent.setup>,
  contact: Record<string, string>,
  offlineFirst = false
) {
  render(
    <CreateExhibitorDialog
      open
      onOpenChange={vi.fn()}
      onExhibitorCreated={vi.fn()}
      offlineFirst={offlineFirst}
    />
  );
  await user.type(await screen.findByLabelText(/First Name/), 'Pat');
  await user.type(screen.getByLabelText(/Last Name/), 'Paperform');
  await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
  for (const [label, value] of Object.entries(contact)) {
    await user.type(await screen.findByLabelText(new RegExp(label)), value);
  }
  await user.click(await screen.findByRole('button', { name: 'Add Person' }));
}

describe('create mode: every address part is optional and independent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ people: [], users: [] });
    createUserMock.mockResolvedValue(
      fromAny({ data: { id: 'p1', first_name: 'Pat', last_name: 'Paperform' }, error: null })
    );
    mockCreatePerson.mockResolvedValue({
      id: 'p2',
      firstName: 'Pat',
      lastName: 'Paperform',
      email: null,
      phone: null,
    });
    mockPending.mockResolvedValue([]);
  });

  it('a ZIP alone saves, and reaches createUser', async () => {
    const user = userEvent.setup();
    await addPerson(user, { 'ZIP Code': '75001' });
    await waitFor(() =>
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ zip_code: '75001', city: null, state: null })
      )
    );
  });

  it('a ZIP alone saves, and reaches createPerson (offline-first)', async () => {
    const user = userEvent.setup();
    await addPerson(user, { 'ZIP Code': '75001' }, true);
    await waitFor(() =>
      expect(mockCreatePerson).toHaveBeenCalledWith(
        expect.objectContaining({ zipCode: '75001', city: null, state: null })
      )
    );
  });

  it('a street alone saves', async () => {
    const user = userEvent.setup();
    await addPerson(user, { 'Street Address': '9 Rural Route' });
    await waitFor(() =>
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ street_address: '9 Rural Route', city: null, state: null })
      )
    );
  });
});

describe('the city/state rule stays an edit-mode rule', () => {
  const base = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    dateOfBirth: '',
    juniorHandlerNumbers: {},
    judgeQualifications: [],
    roles: [],
  };
  const messages = (schema: typeof userFormSchema, patch: Record<string, string>) => {
    const result = schema.safeParse({ ...base, ...patch });
    return result.success ? [] : result.error.issues.map(i => i.message);
  };

  it('edit still asks for city and state once any address part is entered', () => {
    expect(messages(userFormSchema, { zipCode: '75001' })).toEqual([
      'Please enter a city when providing address information',
      'Please enter a state when providing address information',
    ]);
    expect(messages(userFormSchema, { address: '1 Main St', city: 'Omaha' })).toEqual([
      'Please enter a state when providing address information',
    ]);
  });

  it('create accepts any partial address', () => {
    expect(messages(userCreateFormSchema, { zipCode: '75001' })).toEqual([]);
    expect(messages(userCreateFormSchema, { address: '1 Main St' })).toEqual([]);
    expect(messages(userCreateFormSchema, { city: 'Omaha' })).toEqual([]);
  });
});
