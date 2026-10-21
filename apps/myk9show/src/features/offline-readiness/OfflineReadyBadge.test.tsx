import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineReadyBadge } from './OfflineReadyBadge';

const { hookState, primeSpy } = vi.hoisted(() => ({
  hookState: {
    readiness: null as { ready: boolean; missing: string[]; asOf: number | null } | null,
    checking: false,
    priming: false,
    primeFailed: false,
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
    hookState.primeFailed = false;
  });

  it('renders nothing while readiness is unknown', () => {
    const { container } = render(<OfflineReadyBadge showId="show-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a ready status with the as-of time when the device is primed', () => {
    hookState.readiness = { ready: true, missing: [], asOf: Date.parse('2026-08-18T18:00:00Z') };

    render(<OfflineReadyBadge showId="show-1" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Offline copy: saved on this device');
    expect(status.getAttribute('title')).toMatch(/oldest sync/i);
  });

  it('renders a not-ready BUTTON that primes the show on click', async () => {
    hookState.readiness = { ready: false, missing: ['classes'], asOf: null };

    render(<OfflineReadyBadge showId="show-1" />);

    const button = screen.getByRole('button', { name: 'Save for show day' });
    await userEvent.click(button);

    expect(primeSpy).toHaveBeenCalledTimes(1);
  });

  it('names the missing signals for diagnosis on the not-ready badge (MYK9-766)', () => {
    hookState.readiness = { ready: false, missing: ['entries', 'classes'], asOf: null };

    render(<OfflineReadyBadge showId="show-1" />);

    expect(screen.getByRole('button', { name: 'Save for show day' })).toHaveAttribute(
      'data-offline-missing',
      'entries,classes'
    );
  });

  it('names the action in visible text, not only in the hover title', () => {
    // This badge is the recovery control on ringside tablets, where there is no
    // hover at all. "Not offline ready" stated the problem; what tapping would
    // do lived only in `title`, so on the devices that need it most the control
    // never explained itself. INTENT bans hover-only interactions outright.
    hookState.readiness = { ready: false, missing: ['classes'], asOf: null };

    render(<OfflineReadyBadge showId="show-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Offline copy: not saved on this device');
    expect(screen.getByRole('button')).toHaveTextContent('Save for show day');
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

    expect(screen.getByRole('button', { name: /saving to this device/i })).toBeDisabled();
  });

  it('is one sentence and exactly one action, with the sync note folded in (MYK9-1282)', () => {
    hookState.readiness = { ready: false, missing: ['classes'], asOf: null };

    render(<OfflineReadyBadge showId="show-1" note="All changes saved" />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.queryByText(/not offline ready|save now/i)).not.toBeInTheDocument();
  });

  it('folds the note into the ready sentence too, and shows it alone while readiness is unknown', () => {
    hookState.readiness = { ready: true, missing: [], asOf: null };
    const { rerender } = render(<OfflineReadyBadge showId="show-1" note="All changes saved" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Offline copy: saved on this device·All changes saved'
    );

    hookState.readiness = null;
    rerender(<OfflineReadyBadge showId="show-1" note="All changes saved" />);
    expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
    expect(screen.queryByText(/offline copy/i)).not.toBeInTheDocument();
  });

  it('keeps the note inside the status region in both branches so it is announced', () => {
    hookState.readiness = { ready: false, missing: ['classes'], asOf: null };
    const { rerender } = render(<OfflineReadyBadge showId="show-1" note="Sync needs attention" />);
    expect(screen.getByRole('status')).toHaveTextContent('Sync needs attention');
    expect(screen.getByRole('button')).not.toHaveTextContent('Sync needs attention');

    hookState.readiness = { ready: true, missing: [], asOf: null };
    rerender(<OfflineReadyBadge showId="show-1" note="Sync needs attention" />);
    expect(screen.getByRole('status')).toHaveTextContent('Sync needs attention');
  });

  it('after a failed save says so and offers Try again (primeFailed)', () => {
    hookState.readiness = { ready: false, missing: ['classes'], asOf: null };
    hookState.primeFailed = true;

    render(<OfflineReadyBadge showId="show-1" />);

    expect(screen.getByRole('status')).toHaveTextContent("Couldn't save the offline copy");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('reads cleanly when a ready device is offline (no doubled "Offline")', () => {
    hookState.readiness = { ready: true, missing: [], asOf: null };

    render(
      <OfflineReadyBadge
        showId="show-1"
        note="Changes saved on this device, will sync when online"
      />
    );

    expect(screen.getByRole('status').textContent).toBe(
      'Offline copy: saved on this device·Changes saved on this device, will sync when online'
    );
  });
});
