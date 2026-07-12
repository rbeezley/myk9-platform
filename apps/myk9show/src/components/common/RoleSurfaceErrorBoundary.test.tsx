import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { render, screen } from '@/test/utils/testUtils';
import { RoleSurfaceErrorBoundary } from './RoleSurfaceErrorBoundary';

function BrokenSurface(): null {
  throw new Error('boom');
}

function HealthySurface() {
  return <p>Recovered surface</p>;
}

describe('RoleSurfaceErrorBoundary', () => {
  it.each([
    ['ringside', 'Your ring work is still saved on this device.'],
    ['secretary', 'Your show work is still saved.'],
    ['judge', 'Any saved scoring work stays on this device.'],
    ['exhibitor', 'Your entries and dog information are still here.'],
    ['admin', 'The platform data is still intact.'],
  ] as const)('renders calm fallback copy for %s surfaces', (surface, reassurance) => {
    render(
      <RoleSurfaceErrorBoundary surface={surface}>
        <BrokenSurface />
      </RoleSurfaceErrorBoundary>
    );

    expect(screen.getByText(reassurance)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('resets the boundary when Try again is clicked', async () => {
    let shouldThrow = true;
    const { user, rerender } = render(
      <RoleSurfaceErrorBoundary surface="ringside">
        {shouldThrow ? <BrokenSurface /> : <HealthySurface />}
      </RoleSurfaceErrorBoundary>
    );

    shouldThrow = false;
    rerender(
      <RoleSurfaceErrorBoundary surface="ringside">
        {shouldThrow ? <BrokenSurface /> : <HealthySurface />}
      </RoleSurfaceErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('Recovered surface')).toBeInTheDocument();
  });

  it('renders child routes through Outlet when used as a layout route', () => {
    render(
      <Routes>
        <Route element={<RoleSurfaceErrorBoundary surface="secretary" />}>
          <Route path="/" element={<p>Outlet surface</p>} />
        </Route>
      </Routes>
    );

    expect(screen.getByText('Outlet surface')).toBeInTheDocument();
  });
});
