// Raw render on purpose: GuestLanding owns its router, and the shared test render wraps its
// subject in one, which React Router refuses to nest.
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GuestLanding } from './GuestLanding';

vi.mock('@/pages/Home', () => ({ default: () => <main>light landing page</main> }));

// The banner's file cannot be fetched.
vi.mock('@/components/pwa/PWAInstallBanner', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('GuestLanding when the install banner cannot be fetched', () => {
  it('shows the landing page without a banner: no error, no hand-over', async () => {
    const onLeave = vi.fn();
    render(<GuestLanding onLeave={onLeave} onRouter={vi.fn()} />);
    // Let the failed import settle.
    await act(() => new Promise(resolve => setTimeout(resolve, 50)));

    expect(screen.getByText('light landing page')).toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
