import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';

const profileState = vi.hoisted(() => ({
  profile: { id: 'profile-1', results_public: false } as {
    id: string;
    results_public: boolean;
  } | null,
  profileSettled: true,
  setResultsPublic: vi.fn<(next: boolean) => Promise<boolean>>(),
  isSettingResultsPublic: false,
}));

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => profileState,
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { ResultsPrivacySetting } from '../ResultsPrivacySetting';

describe('ResultsPrivacySetting (MYK9-969)', () => {
  beforeEach(() => {
    profileState.profile = { id: 'profile-1', results_public: false };
    profileState.profileSettled = true;
    profileState.setResultsPublic.mockReset().mockResolvedValue(true);
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it('shows the switch OFF by default and says who can see the results', () => {
    render(<ResultsPrivacySetting />);
    const toggle = screen.getByRole('switch', { name: 'Show my results publicly' });
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(/Only you, your dogs' co-owners and handlers, and show staff/)
    ).toBeInTheDocument();
  });

  it('turning it on saves results_public = true for the account', async () => {
    const user = userEvent.setup();
    render(<ResultsPrivacySetting />);
    await user.click(screen.getByRole('switch', { name: 'Show my results publicly' }));
    expect(profileState.setResultsPublic).toHaveBeenCalledWith(true);
    expect(toastMock.success).toHaveBeenCalledWith('Your results are now public');
  });

  it('turning it off saves results_public = false', async () => {
    profileState.profile = { id: 'profile-1', results_public: true };
    const user = userEvent.setup();
    render(<ResultsPrivacySetting />);
    const toggle = screen.getByRole('switch', { name: 'Show my results publicly' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(profileState.setResultsPublic).toHaveBeenCalledWith(false);
  });

  it('reports a failed save instead of pretending it worked', async () => {
    profileState.setResultsPublic.mockRejectedValue(new Error('permission denied'));
    const user = userEvent.setup();
    render(<ResultsPrivacySetting />);
    await user.click(screen.getByRole('switch', { name: 'Show my results publicly' }));
    expect(toastMock.error).toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('renders nothing until the profile is known', () => {
    profileState.profileSettled = false;
    const { container } = render(<ResultsPrivacySetting />);
    expect(container).toBeEmptyDOMElement();
  });
});
