/**
 * The feature's only write, end to end: badge -> dialog -> Save -> `onUpdate`,
 * and the badge repainting from the result. Assertion-first per CLAUDE.md —
 * `{status, deceasedDate}` is a specific pair of values going to a specific
 * place, and nothing asserted the payload at any layer.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import DogDetailsMain from '../index';

const dog: Dog = {
  id: 'dog-1',
  name: 'Juniper',
  callName: 'Juni',
  breed: 'Border Collie',
  sex: 'female',
  ownerId: 'owner-1',
  status: 'active',
};

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error('x') }) }),
      }),
    }),
  },
}));
vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: { people: unknown[] }) => unknown) => selector({ people: [] }),
}));
vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector: (s: { entries: unknown[] }) => unknown) => selector({ entries: [] }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ getUserRoles: () => ['exhibitor'], hasRole: () => false }),
  getPrimaryRole: () => 'exhibitor',
}));
vi.mock('@/hooks/useRoleBasedData', () => ({ useCanDeleteDog: () => false }));
vi.mock('@/hooks/useBreadcrumb', () => ({ useBreadcrumb: () => [] }));
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useRegistrationsByDogQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
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
// Render-heavy and off the path under test. The rail and the status dialog stay REAL.
vi.mock('../DogDetailsTabs', () => ({ default: () => <div data-testid="tabs" /> }));
vi.mock('../DogDialogs', () => ({ default: () => <div data-testid="dialogs" /> }));

beforeEach(() => {
  vi.clearAllMocks();
});

function openStatusDialogFromBadge() {
  fireEvent.click(screen.getByRole('button', { name: /active.*change status/i }));
  return screen.getByRole('heading', { name: 'Change Status' });
}

describe('saving a dog status from the card badge', () => {
  it('sends the deceased status AND the date of passing to onUpdate', async () => {
    const onUpdate = vi
      .fn()
      .mockResolvedValue({ ...dog, status: 'deceased', deceasedDate: '2026-03-03' });
    render(<DogDetailsMain dog={dog} onUpdate={onUpdate} />);

    openStatusDialogFromBadge();
    fireEvent.click(screen.getByText('Deceased'));
    fireEvent.change(screen.getByLabelText(/date of passing/i), {
      target: { value: '2026-03-03' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('dog-1', {
        status: 'deceased',
        deceasedDate: '2026-03-03',
      })
    );
  });

  it('repaints the badge from the saved status, with the date beside it', async () => {
    const onUpdate = vi
      .fn()
      .mockResolvedValue({ ...dog, status: 'deceased', deceasedDate: '2026-03-03' });
    render(<DogDetailsMain dog={dog} onUpdate={onUpdate} />);

    openStatusDialogFromBadge();
    fireEvent.click(screen.getByText('Deceased'));
    fireEvent.change(screen.getByLabelText(/date of passing/i), {
      target: { value: '2026-03-03' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/Deceased/)).toBeInTheDocument());
    expect(screen.getByText(/3\/3\/2026/)).toBeInTheDocument();
  });

  it('sends no date for a status that has none', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...dog, status: 'retired' });
    render(<DogDetailsMain dog={dog} onUpdate={onUpdate} />);

    openStatusDialogFromBadge();
    fireEvent.click(screen.getByText('Retired'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('dog-1', {
        status: 'retired',
        deceasedDate: undefined,
      })
    );
  });

  // A rejected write must not leave the card claiming a status the DB refused.
  it('leaves the badge alone when the update returns nothing', async () => {
    const onUpdate = vi.fn().mockResolvedValue(null);
    render(<DogDetailsMain dog={dog} onUpdate={onUpdate} />);

    openStatusDialogFromBadge();
    fireEvent.click(screen.getByText('Retired'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /active.*change status/i })).toBeInTheDocument();
    expect(screen.queryByText('Retired')).not.toBeInTheDocument();
  });
});
