import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { AddToCalendarDialog } from './AddToCalendarDialog';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));
vi.mock('./calendarFeedUrls', async () => {
  const actual = await vi.importActual<typeof import('./calendarFeedUrls')>('./calendarFeedUrls');
  return { ...actual, getCalendarFeedBaseUrl: () => 'https://feed.example.test' };
});

describe('AddToCalendarDialog load failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, headers: new Headers() }));
  });

  it('shows a plain sentence, never the raw fetch error, and retries', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    rpc.mockResolvedValueOnce({ data: 'token-abc', error: null });

    render(<AddToCalendarDialog open onOpenChange={() => {}} showId="show-1" showName="Spring" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "We couldn't get your calendar link. Check your connection and try again."
    );
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Add to my calendar' })).toBeInTheDocument()
    );
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith('issue_calendar_feed_token', { p_show_id: 'show-1' });
  });
});
