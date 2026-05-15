import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

import { WaitlistFormLanding } from '../WaitlistFormLanding';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockSupabase = supabase as unknown as { from: Mock };

describe('WaitlistFormLanding', () => {
  const insertMock = vi.fn();

  beforeEach(() => {
    insertMock.mockReset();
    mockSupabase.from.mockReset();
    mockSupabase.from.mockReturnValue({ insert: insertMock });
  });

  it('inserts the lower-cased email and selected role into platform_waitlist', async () => {
    const user = userEvent.setup();
    insertMock.mockResolvedValueOnce({ error: null });

    render(<WaitlistFormLanding source="myk9show.com" />);

    await user.type(screen.getByLabelText(/email/i), 'TEST@Example.com');
    await user.click(screen.getByRole('button', { name: /join the waitlist/i }));

    expect(mockSupabase.from).toHaveBeenCalledWith('platform_waitlist');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        role: 'exhibitor',
        source: 'myk9show.com',
      }),
    );
    expect(await screen.findByText(/you're on the list/i)).toBeInTheDocument();
  });

  it('treats Postgres unique-violation (23505) as success — the user is on the list either way', async () => {
    const user = userEvent.setup();
    insertMock.mockResolvedValueOnce({ error: { code: '23505' } });

    render(<WaitlistFormLanding source="myk9show.com" />);

    await user.type(screen.getByLabelText(/email/i), 'duplicate@example.com');
    await user.click(screen.getByRole('button', { name: /join the waitlist/i }));

    expect(await screen.findByText(/you're on the list/i)).toBeInTheDocument();
    // The form must NOT remain visible, since the user would otherwise
    // think their submit was lost and try again.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('shows an error message and keeps the form visible when Supabase returns a non-23505 error', async () => {
    const user = userEvent.setup();
    insertMock.mockResolvedValueOnce({ error: { code: '42501', message: 'permission denied' } });

    render(<WaitlistFormLanding source="myk9show.com" />);

    await user.type(screen.getByLabelText(/email/i), 'broken@example.com');
    await user.click(screen.getByRole('button', { name: /join the waitlist/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    // Form is still mounted so the user can retry.
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('blocks submission with an inline error when email is empty', async () => {
    const user = userEvent.setup();

    render(<WaitlistFormLanding source="myk9show.com" />);

    await user.click(screen.getByRole('button', { name: /join the waitlist/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
