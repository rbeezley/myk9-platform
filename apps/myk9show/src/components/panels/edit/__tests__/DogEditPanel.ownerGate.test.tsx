import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { DogEditPanel } from '../DogEditPanel';
import { UserRole } from '@/types/auth-types';

// MYK9-1158: staff who may edit an account holder's dog cannot re-own it (the server's
// trg_00_guard_owner_change). The panel asks can_change_dog_owner() for its own dog and the
// owner field follows the answer; a site admin always may, and never waits on the server.
const rpc = vi.fn();
const from = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function peopleQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: [{ id: 'p1', first_name: 'Alice', last_name: 'Smith', email: null }],
      error: null,
    }),
  };
}

// The owner field lives under the collapsed "More details" group.
async function renderPanel(userRole: UserRole) {
  const user = userEvent.setup();
  render(
    <DogEditPanel
      open={true}
      onClose={vi.fn()}
      dogId="dog-1"
      dogName="Rex"
      initialDogData={{ ownerId: 'p1' }}
      userRole={userRole}
      people={[{ id: 'p1', firstName: 'Alice', lastName: 'Smith' } as never]}
    />
  );
  await user.click(screen.getByRole('button', { name: /More details/i }));
}

describe('DogEditPanel owner field follows can_change_dog_owner (MYK9-1158)', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation(() => peopleQuery());
  });

  it('a secretary the server refuses sees the owner read-only', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await renderPanel(UserRole.SECRETARY);

    expect(
      await screen.findByText('Only the owner can change who owns this dog.')
    ).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('can_change_dog_owner', { p_dog_id: 'dog-1' });
    expect(screen.queryByRole('combobox', { name: /owner/i })).toBeNull();
  });

  it('a secretary the server allows keeps the owner picker', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await renderPanel(UserRole.SECRETARY);

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(await screen.findByRole('option', { name: /Alice Smith/ })).toBeInTheDocument();
    expect(screen.queryByText('Only the owner can change who owns this dog.')).toBeNull();
  });

  it('a site admin keeps the picker without asking the server', async () => {
    await renderPanel(UserRole.SITE_ADMIN);

    expect(await screen.findByRole('option', { name: /Alice Smith/ })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('can_change_dog_owner', expect.anything());
  });
});
