/**
 * MYK9-750 (#2261 review): hard_delete_show refuses a show with Stripe orders
 * as SQLSTATE 23503 with a sentence that says what to do. The dialog used to
 * rethrow only the message, so the code was lost and the admin saw a generic
 * error instead of the refusal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Plain render: the dialog needs no router or query client, and the custom
// render's auth provider would read the supabase client mocked away below.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import DeleteShowDialog from '../DeleteShowDialog';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ isAdmin: true }) }));
vi.mock('@/components/common/CascadingDeleteDialog', () => ({
  CascadingDeleteDialog: ({ onConfirm }: { onConfirm: (permanent?: boolean) => void }) => (
    <button type="button" onClick={() => onConfirm(true)}>
      Delete forever
    </button>
  ),
}));

const REFUSAL =
  'This show has 2 Stripe order(s); refunds and reconciliation still reference them. Permanent deletion is refused. Resolve or reassign those orders first.';

describe('DeleteShowDialog permanent-delete refusal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Production copy: in DEV getUserFriendlyError echoes any raw message,
    // which would hide the bug this pins.
    vi.stubEnv('DEV', false);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('shows the server refusal, not a generic error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23503', message: REFUSAL } });
    const onDelete = vi.fn();

    render(
      <DeleteShowDialog
        open
        onOpenChange={vi.fn()}
        showId="show-1"
        showName="Bluegrass Classic"
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(REFUSAL));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
