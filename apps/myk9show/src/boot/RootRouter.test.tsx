// Raw render on purpose: RootRouter owns its routers, and the shared test render wraps its
// subject in one, which React Router refuses to nest.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link } from 'react-router-dom';
import { RootRouter } from './RootRouter';

vi.mock('@/pages/Home', () => ({
  default: () => (
    <main>
      <p>light landing page</p>
      <Link to="/sign-in">Sign in</Link>
    </main>
  ),
}));

// The full app, as its own module: built when first imported, while the URL is whatever it is.
vi.mock('../router', async () => {
  const { createBrowserRouter } = await import('react-router-dom');
  return {
    router: createBrowserRouter([
      { path: '/', element: <p>full app home</p> },
      { path: '/sign-in', element: <p>full app sign-in</p> },
      { path: '/shows', element: <p>full app shows</p> },
    ]),
  };
});

describe('RootRouter', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('shows the full app, at the current URL, to anyone who is not a guest on the landing page', async () => {
    window.history.replaceState({}, '', '/shows');
    const onRouter = vi.fn();
    render(<RootRouter guestBoot={false} onRouter={onRouter} />);

    expect(await screen.findByText('full app shows')).toBeInTheDocument();
    expect(onRouter).toHaveBeenCalledTimes(1);
  });

  it('shows a guest the light landing page, then the full app at the page they went to', async () => {
    const onRouter = vi.fn();
    render(<RootRouter guestBoot onRouter={onRouter} />);

    expect(screen.getByText('light landing page')).toBeInTheDocument();
    expect(screen.queryByText('full app home')).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));

    expect(await screen.findByText('full app sign-in')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/sign-in');
    // Once for the landing page's router, once for the full app's.
    expect(onRouter).toHaveBeenCalledTimes(2);
  });
});
