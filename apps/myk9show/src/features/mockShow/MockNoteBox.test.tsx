import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MockNoteBox } from './MockNoteBox';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: vi.fn(),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'tester-1' },
    userWithRoles: { roles: ['secretary'], scopes: [] },
  }),
}));

describe('MockNoteBox', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('leaves a lasting "Sent" line after a free note, so it is not sent twice', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'free-1' }], error: null });
    const { user } = render(
      <MockNoteBox id="n" target={{ part: 'free' }} ticket={null} label="Your note" />
    );

    await user.type(screen.getByLabelText('Your note'), 'The cart froze.');
    await user.click(screen.getByRole('button', { name: 'Send note' }));

    expect(await screen.findByText('Sent. Thank you.')).toBeInTheDocument();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
