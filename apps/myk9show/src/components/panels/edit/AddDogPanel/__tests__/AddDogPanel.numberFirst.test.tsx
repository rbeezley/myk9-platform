/**
 * MYK9-1162: Add Dog starts with the registry identity. "Find dog" looks the number up on
 * the device first, then (online only) asks the server for a bare yes or no, before any other
 * dog detail is asked for. The real panel, wrapper, gate and lookup wrapper render here; only
 * the dog store, the people query and the Supabase client are faked.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { fromAny } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { UserRole } from '@/types/auth-types';
import type { Dog } from '@/types/dog-types';
import { AddDogPanel } from '../index';
import {
  quickCreateMocks as mocks,
  resetQuickCreateMocks,
} from '@/test/quickCreate/quickCreateFlowMocks';
import {
  addFirstRegistration,
  chooseOption,
  fillDogBasics,
  JOURNEY_TIMEOUT_MS,
} from '@/test/quickCreate/quickCreateFlowKit';

const store = vi.hoisted(() => ({ dogs: [] as unknown[] }));

vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    addDog: mocks.addDog,
    addDogOfflineFirst: mocks.addDogOfflineFirst,
    updateDog: mocks.updateDog,
    dogs: store.dogs,
    isLoading: false,
    error: null,
  }),
}));
vi.mock(
  '@/components/ui/popover',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).popoverModule
);

const TAKEN_MESSAGE =
  'This number is already registered to another dog. Contact the show secretary.';
const AKC = 'AKC (American Kennel Club)';

const dogOnDevice = (overrides: Record<string, unknown> = {}): Dog =>
  fromAny({
    id: 'dog-1',
    callName: 'Ace',
    name: 'Ace',
    ownerId: 'someone-else',
    sex: 'male',
    registrations: [
      {
        id: 'reg-1',
        organization: 'AKC',
        registrationNumber: 'DN12345601',
        registeredName: 'Ace of Spades',
        breed: 'Labrador Retriever',
        status: 'Active',
      },
    ],
    ...overrides,
  });

function renderPanel(
  userRole: UserRole = UserRole.EXHIBITOR,
  props: { onClose?: () => void } = {}
) {
  const onDogCreated = vi.fn();
  const onClose = props.onClose ?? vi.fn();
  return {
    onDogCreated,
    onClose,
    ...render(
      <AddDogPanel
        open
        onClose={onClose}
        onDogCreated={onDogCreated}
        userRole={userRole}
        currentUserPersonId="person-1"
      />
    ),
  };
}

type User = ReturnType<typeof renderPanel>['user'];

/** Chooses AKC and types a number, without pressing Find dog. */
async function typeIdentity(user: User, number = 'DN12345601') {
  await chooseOption(user, document.getElementById('organization') as HTMLElement, AKC);
  await user.click(document.getElementById('registrationNumber') as HTMLElement);
  await user.paste(number);
}

const findDog = (user: User) => user.click(screen.getByRole('button', { name: 'Find dog' }));
const registryCalls = () =>
  mockSupabase.rpc.mock.calls.filter(([name]) => name === 'registry_identity_taken');

beforeEach(() => {
  resetQuickCreateMocks();
  store.dogs = [];
  onlineManager.setOnline(true);
});
afterEach(() => {
  onlineManager.setOnline(true);
});

describe('AddDogPanel number first (MYK9-1162)', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('walks Registration, then Essential, then Optional details, opening on Registration', async () => {
    renderPanel();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual([
      expect.stringContaining('Registration'),
      expect.stringContaining('Essential'),
      expect.stringContaining('Optional details'),
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Find dog' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Call Name/i)).toBeNull();
  });

  it('asks the server about the identity as typed, and no match reveals the rest of the registration', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: false, error: null });
    const { user } = renderPanel();
    await typeIdentity(user);
    expect(screen.queryByLabelText(/Registered Name/i)).toBeNull();

    await findDog(user);

    expect(await screen.findByLabelText(/Registered Name/i)).toBeInTheDocument();
    expect(document.getElementById('breed')).not.toBeNull();
    expect(mockSupabase.rpc).toHaveBeenCalledWith('registry_identity_taken', {
      p_organization: AKC,
      p_registration_number: 'DN12345601',
    });
  });

  it('carries the number into the dog as its first registration', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: false, error: null });
    const { user } = renderPanel();
    await addFirstRegistration(user);
    await fillDogBasics(user);
    await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Dog' }));

    await waitFor(() =>
      expect(mocks.addDog).toHaveBeenCalledWith(
        expect.objectContaining({
          registrations: [
            {
              organization: AKC,
              number: 'DN12345601',
              registeredName: 'Mailbox Special Delivery',
              type: 'Golden Retriever',
              status: 'Active',
            },
          ],
        }),
        {}
      )
    );
  });

  it('offers a dog already on the device, from any owner, without asking the server', async () => {
    store.dogs = [dogOnDevice()];
    const { user, onDogCreated, onClose } = renderPanel();
    await typeIdentity(user, 'dn-12345601');

    await findDog(user);

    expect(await screen.findByText(/This looks like Ace/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Registered Name/i)).toBeNull();
    // A separate dog is not an option for a number that is already taken.
    expect(screen.queryByRole('button', { name: /Create separate dog/ })).toBeNull();
    expect(registryCalls()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Use existing dog' }));
    expect(onDogCreated).toHaveBeenCalledWith(store.dogs[0], { existing: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores a soft-deleted dog on the device', async () => {
    store.dogs = [dogOnDevice({ deletedAt: '2026-10-01T00:00:00Z' })];
    mockSupabase.rpc.mockResolvedValue({ data: false, error: null });
    const { user } = renderPanel();
    await typeIdentity(user);

    await findDog(user);

    expect(await screen.findByLabelText(/Registered Name/i)).toBeInTheDocument();
    expect(screen.queryByText(/This looks like/)).toBeNull();
  });

  it('says only that the number is taken when the server knows a dog the user cannot see', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
    const { user } = renderPanel();
    await typeIdentity(user);

    await findDog(user);

    expect(await screen.findByText(TAKEN_MESSAGE)).toBeInTheDocument();
    // Nothing about that dog: no card, no name, no way to use or duplicate it, no more fields.
    expect(screen.queryByText(/This looks like/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use existing dog' })).toBeNull();
    expect(screen.queryByLabelText(/Registered Name/i)).toBeNull();
  });

  it('blocks an exhibitor from continuing with a taken identity', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
    const { user } = renderPanel();
    await typeIdentity(user);
    await findDog(user);
    await screen.findByText(TAKEN_MESSAGE);

    await user.click(screen.getByRole('tab', { name: /Essential/ }));

    expect(screen.getByRole('tab', { name: /Registration/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(await screen.findByTestId('edit-panel-step-blocked')).toBeInTheDocument();
  });

  it('editing the number after a refusal starts the lookup over', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
    const { user } = renderPanel();
    await typeIdentity(user);
    await findDog(user);
    await screen.findByText(TAKEN_MESSAGE);

    await user.type(document.getElementById('registrationNumber') as HTMLElement, '9');

    await waitFor(() => expect(screen.queryByText(TAKEN_MESSAGE)).toBeNull());
    expect(screen.getByRole('button', { name: 'Find dog' })).toBeEnabled();
  });

  it('continues on the device result alone when the server cannot answer', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });
    const { user } = renderPanel();
    await typeIdentity(user);

    await findDog(user);

    expect(await screen.findByLabelText(/Registered Name/i)).toBeInTheDocument();
    expect(screen.queryByText(TAKEN_MESSAGE)).toBeNull();
  });

  it('offline: checks only the device, never asks the network, and lets the user continue', async () => {
    onlineManager.setOnline(false);
    const { user } = renderPanel();
    await typeIdentity(user);

    await findDog(user);

    expect(await screen.findByLabelText(/Registered Name/i)).toBeInTheDocument();
    expect(registryCalls()).toHaveLength(0);
  });

  it('offline: still offers a dog the device holds', async () => {
    onlineManager.setOnline(false);
    store.dogs = [dogOnDevice()];
    const { user } = renderPanel();
    await typeIdentity(user);

    await findDog(user);

    expect(await screen.findByText(/This looks like Ace/)).toBeInTheDocument();
    expect(registryCalls()).toHaveLength(0);
  });

  it('asks for a registry and a valid number before looking anything up', async () => {
    const { user } = renderPanel();

    await findDog(user);
    expect(await screen.findByText('Please select an organization.')).toBeInTheDocument();

    await chooseOption(user, document.getElementById('organization') as HTMLElement, AKC);
    await user.click(document.getElementById('registrationNumber') as HTMLElement);
    await user.paste('bad number!');
    await findDog(user);

    expect(
      await screen.findByText('Only letters, numbers, hyphens, and slashes are allowed.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Registered Name/i)).toBeNull();
    expect(registryCalls()).toHaveLength(0);
  });
});

describe(
  'AddDogPanel who may skip the registration (MYK9-1162)',
  { timeout: JOURNEY_TIMEOUT_MS },
  () => {
    it('shows an exhibitor no skip', async () => {
      renderPanel(UserRole.EXHIBITOR);
      await screen.findByRole('button', { name: 'Find dog' });
      expect(screen.queryByRole('button', { name: /No registration number yet/ })).toBeNull();
    });

    it.each([UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])(
      'lets %s skip the lookup and add the dog with no registration',
      async role => {
        const { user } = renderPanel(role);
        await user.click(await screen.findByRole('button', { name: /No registration number yet/ }));
        expect(registryCalls()).toHaveLength(0);

        await fillDogBasics(user);
        await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
        await user.click(await screen.findByRole('button', { name: 'Add Dog' }));

        await waitFor(() =>
          expect(mocks.addDog).toHaveBeenCalledWith(
            expect.objectContaining({ registrations: [] }),
            {}
          )
        );
      }
    );

    it('does not let a judge skip either', async () => {
      renderPanel(UserRole.JUDGE);
      await screen.findByRole('button', { name: 'Find dog' });
      expect(screen.queryByRole('button', { name: /No registration number yet/ })).toBeNull();
    });
  }
);
