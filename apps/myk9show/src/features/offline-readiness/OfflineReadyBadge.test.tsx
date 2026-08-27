import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineReadyBadge } from './OfflineReadyBadge';

const { hookState, primeSpy } = vi.hoisted(() => ({
  hookState: {
    readiness: null as { ready: boolean; missing: string[]; asOf: number | null } | null,
    checking: false,
    priming: false,
  },
  primeSpy: vi.fn(async () => {}),
}));

vi.mock('./useOfflineReadiness', () => ({
  useOfflineReadiness: () => ({ ...hookState, prime: primeSpy }),
}));

describe('OfflineReadyBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.readiness = null;
    hookState.checking = false;
    hookState.priming = false;
  });

  it('renders nothing while readiness is unknown', () => {
    const { container } = render(<OfflineReadyBadge showId="show-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a ready status with the as-of time when the device is primed', () => {
    hookState.readiness = { ready: true, missing: [], asOf: Date.parse('2026-08-18T18:00:00Z') };

    render(<OfflineReadyBadge showId="show-1" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/offline ready/i);
    expect(status.getAttribute('title')).toMatch(/oldest sync/i);
  });

  it('renders a not-ready BUTTON that primes the show on click', async () => {
    hookState.readiness = { ready: false, missing: ['classes'], asOf: null };

    render(<OfflineReadyBadge showId="show-1" />);

    const button = screen.getByRole('button', { name: /not offline ready/i });
    await userEvent.click(button);

    expect(primeSpy).toHaveBeenCalledTimes(1);
  });

  it('names the action in visible text, not only in the hover title', () => {
    // This badge is the recovery control on ringside tablets, where there is no
    // hover at all. "Not offline ready" stated the problem; what tapping would
    // do lived only in `title`, so on the devices that need it most the control
    // never explained itself. INTENT bans hover-only interactions outright.
    hookState.readiness = { ready: false, missing: ['classes'], asOf: null };

    render(<OfflineReadyBadge showId="show-1" />);

    expect(screen.getByRole('button')).toHaveTextContent(/save now/i);
  });

  it('keeps the visible label inside the accessible name (WCAG 2.5.3)', () => {
    // An aria-label here would REPLACE the name with a sentence that shares no
    // words with the visible text, so a speech-input user saying what they see
    // could not activate it. The detail belongs in `title`, as a description.
    hookState.readiness = { ready: false, missing: ['classes'], asOf: null };

    render(<OfflineReadyBadge showId="show-1" />);

    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('aria-label');
    expect(button.getAttribute('title')).toMatch(/save the show to this device/i);
  });

  it('shows a preparing state while priming', () => {
    hookState.readiness = { ready: false, missing: ['entries'], asOf: null };
    hookState.priming = true;

    render(<OfflineReadyBadge showId="show-1" />);

    expect(screen.getByRole('button', { name: /preparing/i })).toBeDisabled();
  });
});
