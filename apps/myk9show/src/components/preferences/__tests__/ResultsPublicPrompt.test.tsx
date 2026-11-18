import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';

interface ProfileState {
  profile: {
    id: string;
    results_public: boolean;
    results_public_prompt_answered_at: string | null;
  } | null;
  profileSettled: boolean;
  answerResultsPublicPrompt: ReturnType<typeof vi.fn>;
  isAnsweringResultsPublicPrompt: boolean;
}

const profileState = vi.hoisted(
  () =>
    ({
      profile: null,
      profileSettled: true,
      answerResultsPublicPrompt: vi.fn(),
      isAnsweringResultsPublicPrompt: false,
    }) as ProfileState
);
const showState = vi.hoisted(() => ({
  data: { resultsPrivate: false } as { resultsPrivate: boolean } | undefined,
}));
const networkState = vi.hoisted(() => ({ isOnline: true }));

vi.mock('@/hooks/useExhibitorProfile', () => ({ useExhibitorProfile: () => profileState }));
vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: () => showState,
}));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => networkState.isOnline }));

import { ResultsPublicPrompt, type ResultsPublicPromptProps } from '../ResultsPublicPrompt';

const baseProps: ResultsPublicPromptProps = {
  showId: 'show-1',
  dogName: 'Scout',
  className: 'Container Novice A',
  placement: 1,
  isReleased: true,
};

describe('ResultsPublicPrompt (MYK9-1944)', () => {
  beforeEach(() => {
    profileState.profile = {
      id: 'profile-1',
      results_public: false,
      results_public_prompt_answered_at: null,
    };
    profileState.profileSettled = true;
    profileState.answerResultsPublicPrompt.mockReset().mockResolvedValue('2026-11-18T00:00:00Z');
    showState.data = { resultsPrivate: false };
    networkState.isOnline = true;
  });

  it('asks when the dog placed, the class is released and the setting is off', () => {
    render(<ResultsPublicPrompt {...baseProps} />);
    expect(
      screen.getByText('Scout placed 1st in Container Novice A. Show your results publicly?')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This shows all your dogs' results publicly, at every show. You can change it in your account."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show publicly' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep private' })).toBeInTheDocument();
  });

  it('does not ask when the setting is already on', () => {
    profileState.profile = {
      id: 'profile-1',
      results_public: true,
      results_public_prompt_answered_at: null,
    };
    render(<ResultsPublicPrompt {...baseProps} />);
    expect(screen.queryByTestId('results-public-prompt')).not.toBeInTheDocument();
  });

  it.each([null, undefined, 0])('does not ask when the dog did not place (%s)', placement => {
    render(<ResultsPublicPrompt {...baseProps} placement={placement} />);
    expect(screen.queryByTestId('results-public-prompt')).not.toBeInTheDocument();
  });

  it('does not ask before the class is released', () => {
    render(<ResultsPublicPrompt {...baseProps} isReleased={false} />);
    expect(screen.queryByTestId('results-public-prompt')).not.toBeInTheDocument();
  });

  it('does not ask for a show the club keeps private', () => {
    showState.data = { resultsPrivate: true };
    render(<ResultsPublicPrompt {...baseProps} />);
    expect(screen.queryByTestId('results-public-prompt')).not.toBeInTheDocument();
  });

  it('does not ask while the show setting is unknown', () => {
    showState.data = undefined;
    render(<ResultsPublicPrompt {...baseProps} />);
    expect(screen.queryByTestId('results-public-prompt')).not.toBeInTheDocument();
  });

  it('does not ask again once answered on any device', () => {
    profileState.profile = {
      id: 'profile-1',
      results_public: false,
      results_public_prompt_answered_at: '2026-11-01T00:00:00Z',
    };
    render(<ResultsPublicPrompt {...baseProps} />);
    expect(screen.queryByTestId('results-public-prompt')).not.toBeInTheDocument();
  });

  it('does not ask before the profile has loaded', () => {
    profileState.profileSettled = false;
    render(<ResultsPublicPrompt {...baseProps} />);
    expect(screen.queryByTestId('results-public-prompt')).not.toBeInTheDocument();
  });

  it('Show publicly answers yes and tells the exhibitor a co-owner or handler can still keep it private', async () => {
    const user = userEvent.setup();
    render(<ResultsPublicPrompt {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Show publicly' }));
    expect(profileState.answerResultsPublicPrompt).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('results-public-note')).toHaveTextContent(
      /everyone on the entry \(owner, co-owner and handler\)/
    );
    expect(screen.queryByTestId('results-public-prompt')).not.toBeInTheDocument();
  });

  it('Keep private answers no and leaves nothing behind', async () => {
    const user = userEvent.setup();
    render(<ResultsPublicPrompt {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Keep private' }));
    expect(profileState.answerResultsPublicPrompt).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('results-public-note')).not.toBeInTheDocument();
  });

  it('keeps the question and says nothing was saved when offline', async () => {
    const user = userEvent.setup();
    networkState.isOnline = false;
    profileState.answerResultsPublicPrompt.mockRejectedValue(new Error('Failed to fetch'));
    render(<ResultsPublicPrompt {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Show publicly' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline, so this was not saved/);
    expect(screen.getByTestId('results-public-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('results-public-note')).not.toBeInTheDocument();
  });
});
