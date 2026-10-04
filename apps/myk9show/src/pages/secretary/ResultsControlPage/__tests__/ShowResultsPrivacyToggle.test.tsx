import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';

const mutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowResultsPrivacy: () => ({ mutate, isPending: false }),
}));

const mockNetworkState = vi.hoisted(() => ({ isOnline: true }));
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetworkState,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ShowResultsPrivacyToggle } from '../ShowResultsPrivacyToggle';

describe('ShowResultsPrivacyToggle (MYK9-969)', () => {
  beforeEach(() => {
    mutate.mockReset();
    mockNetworkState.isOnline = true;
  });

  it('is off for a show that follows each exhibitor, and turning it on keeps the show private', async () => {
    const user = userEvent.setup();
    render(<ShowResultsPrivacyToggle showId="show-1" resultsPrivate={false} />);
    const toggle = screen.getByRole('switch', { name: "Keep this show's results private" });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(mutate).toHaveBeenCalledWith(
      { showId: 'show-1', resultsPrivate: true },
      expect.any(Object)
    );
  });

  it('says reports are unchanged when the show is private', () => {
    render(<ShowResultsPrivacyToggle showId="show-1" resultsPrivate />);
    expect(screen.getByRole('switch', { name: "Keep this show's results private" })).toBeChecked();
    expect(screen.getByText(/Reports are unchanged/)).toBeInTheDocument();
  });

  it('cannot be flipped without a connection', async () => {
    mockNetworkState.isOnline = false;
    const user = userEvent.setup();
    render(<ShowResultsPrivacyToggle showId="show-1" resultsPrivate={false} />);
    const toggle = screen.getByRole('switch', { name: "Keep this show's results private" });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await user.click(toggle);
    expect(mutate).not.toHaveBeenCalled();
  });
});
