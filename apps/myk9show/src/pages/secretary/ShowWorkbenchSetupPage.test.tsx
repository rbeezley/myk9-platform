import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { Route, Routes, useLocation } from 'react-router-dom';
import { ShowWorkbenchSetupPage } from './ShowWorkbenchSetupPage';

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.hash}
    </div>
  );
}

describe('ShowWorkbenchSetupPage', () => {
  it('redirects legacy Setup links to the show Overview', async () => {
    render(
      <Routes>
        <Route path="/shows/:id/setup" element={<ShowWorkbenchSetupPage />} />
        <Route path="/shows/:id" element={<LocationProbe />} />
      </Routes>,
      { initialRoute: '/shows/show-1/setup' }
    );

    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1');
  });

  it('preserves a readiness hash while redirecting', async () => {
    render(
      <Routes>
        <Route path="/shows/:id/setup" element={<ShowWorkbenchSetupPage />} />
        <Route path="/shows/:id" element={<LocationProbe />} />
      </Routes>,
      { initialRoute: '/shows/show-1/setup#setup-publish' }
    );

    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1#setup-publish');
  });
});
