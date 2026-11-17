// Raw render on purpose: GuestLanding owns its router, and the shared test render wraps its
// subject in one, which React Router refuses to nest.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { GuestLanding } from './GuestLanding';

const home = vi.hoisted(() => ({ crash: false }));

vi.mock('@/pages/Home', () => ({
  default: function HomeStub() {
    const { user, loading } = useAuthContext();
    if (home.crash) throw new Error('landing crashed');
    return (
      <main>
        <p>{user === null && !loading ? 'landing for a guest' : 'not a guest'}</p>
        <Link to="/sign-in">Sign in</Link>
      </main>
    );
  },
}));

vi.mock('@/components/pwa/PWAInstallBanner', () => ({
  PWAInstallBanner: () => <p>install banner</p>,
}));

describe('GuestLanding', () => {
  afterEach(() => {
    home.crash = false;
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('shows the landing page to a guest without the app shell', () => {
    const onLeave = vi.fn();
    render(<GuestLanding onLeave={onLeave} onRouter={vi.fn()} />);

    expect(screen.getByText('landing for a guest')).toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('shows the install banner above the landing page, as the app shell does', async () => {
    render(<GuestLanding onLeave={vi.fn()} onRouter={vi.fn()} />);

    expect(await screen.findByText('install banner')).toBeInTheDocument();
  });

  it('hands its router to the caller for page-view tracking', () => {
    const onRouter = vi.fn();
    render(<GuestLanding onLeave={vi.fn()} onRouter={onRouter} />);

    expect(onRouter).toHaveBeenCalledTimes(1);
    expect(onRouter.mock.calls[0]?.[0].state.location.pathname).toBe('/');
  });

  it('asks for the full app when the visitor follows a link off the landing page', async () => {
    const onLeave = vi.fn();
    render(<GuestLanding onLeave={onLeave} onRouter={vi.fn()} />);

    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));

    await waitFor(() => expect(onLeave).toHaveBeenCalled());
    expect(window.location.pathname).toBe('/sign-in');
  });

  it('asks for the full app when the landing page crashes', () => {
    home.crash = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onLeave = vi.fn();
    render(<GuestLanding onLeave={onLeave} onRouter={vi.fn()} />);

    expect(onLeave).toHaveBeenCalled();
  });
});
