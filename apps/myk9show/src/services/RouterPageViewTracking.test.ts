import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { setupRouterPageViewTracking } from './RouterPageViewTracking';

interface FakeRouterState {
  location: {
    key: string;
  };
}

describe('setupRouterPageViewTracking', () => {
  it('tracks push and replace navigations once per location key', () => {
    let onStateChange: ((state: FakeRouterState) => void) | undefined;
    const unsubscribe = vi.fn();
    const router = {
      state: { location: { key: 'initial' } },
      subscribe: vi.fn((listener: (state: FakeRouterState) => void) => {
        onStateChange = listener;
        return unsubscribe;
      }),
    };
    const analytics = { trackPageView: vi.fn() };

    const stopTracking = setupRouterPageViewTracking(router, analytics);

    onStateChange?.({ location: { key: 'push-1' } });
    onStateChange?.({ location: { key: 'push-1' } });
    onStateChange?.({ location: { key: 'replace-1' } });

    expect(analytics.trackPageView).toHaveBeenCalledTimes(2);
    expect(router.subscribe).toHaveBeenCalledOnce();

    stopTracking();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('tracks real push and back/forward navigations once each', async () => {
    const analytics = { trackPageView: vi.fn() };
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: React.createElement(NavigationFixture),
        },
      ],
      { initialEntries: ['/home'] }
    );
    const stopTracking = setupRouterPageViewTracking(router, analytics);
    const view = render(React.createElement(RouterProvider, { router }));
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: '/home' });

    await user.click(screen.getByRole('button', { name: 'Open details' }));
    await screen.findByRole('heading', { name: '/details' });
    expect(analytics.trackPageView).toHaveBeenCalledTimes(1);

    await router.navigate(-1);
    await screen.findByRole('heading', { name: '/home' });
    expect(analytics.trackPageView).toHaveBeenCalledTimes(2);

    await router.navigate(1);
    await screen.findByRole('heading', { name: '/details' });
    expect(analytics.trackPageView).toHaveBeenCalledTimes(3);

    await waitFor(() => {
      expect(analytics.trackPageView).toHaveBeenCalledTimes(3);
    });

    stopTracking();
    router.dispose();
    view.unmount();
  });
});

function NavigationFixture() {
  const navigate = useNavigate();
  const location = useLocation();

  return React.createElement(
    'main',
    null,
    React.createElement('h1', null, location.pathname),
    React.createElement(
      'button',
      { onClick: () => void navigate('/details') },
      'Open details'
    )
  );
}
