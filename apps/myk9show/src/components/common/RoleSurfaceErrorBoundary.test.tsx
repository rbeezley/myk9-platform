import { describe, expect, it } from 'vitest';

import { render, screen } from '@/test/utils/testUtils';
import { RoleSurfaceErrorBoundary } from './RoleSurfaceErrorBoundary';

function BrokenSurface() {
  throw new Error('boom');
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
});
