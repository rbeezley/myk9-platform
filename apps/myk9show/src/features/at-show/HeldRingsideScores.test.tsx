import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import {
  HeldScoresPromptHost,
  offerHeldScoresAfterPasscode,
  useHeldScoresPromptStore,
} from './heldScoresPrompt';
import { HeldRingsideScoresBanner } from './HeldRingsideScores';

const held = vi.hoisted(() => ({
  count: 2,
  adopt: vi.fn(async () => 2),
}));

vi.mock('@/services/replication/heldRingsideScores', () => ({
  countHeldRingsideScores: async () => held.count,
  adoptHeldRingsideScores: () => held.adopt(),
}));

beforeEach(() => {
  held.count = 2;
  held.adopt = vi.fn(async () => 2);
});

describe('HeldRingsideScoresBanner (MYK9-1205)', () => {
  it('renders nothing when no earlier-session scores are held', async () => {
    held.count = 0;
    render(<HeldRingsideScoresBanner />);
    await waitFor(() => expect(held.adopt).not.toHaveBeenCalled());
    expect(screen.queryByTestId('held-ringside-scores-banner')).not.toBeInTheDocument();
  });

  it('explains the held scores calmly, and "Not now" leaves them held and visible', async () => {
    const { user } = render(<HeldRingsideScoresBanner />);
    const banner = await screen.findByTestId('held-ringside-scores-banner');
    expect(banner).toHaveTextContent(
      "2 scores from an earlier session on this device can't upload yet. They are saved here."
    );

    await user.click(within(banner).getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      '2 scores from an earlier session on this device. Upload them now?'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Not now' }));

    expect(held.adopt).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('held-ringside-scores-banner')).toBeInTheDocument();
  });

  it('adopts once on "Upload them"', async () => {
    const { user } = render(<HeldRingsideScoresBanner />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Upload them' })
    );
    await waitFor(() => expect(held.adopt).toHaveBeenCalledTimes(1));
  });
});

/**
 * The sign-in page is NOT where the question lives: on /at-show the anonymous
 * sign-in swaps the page out (RingsideEntryPage stops rendering SmartSignInPage),
 * so the child here unmounts itself right after offering, as the real page does.
 */
function SignInThatUnmounts() {
  const [mounted, setMounted] = useState(true);
  if (!mounted) return <p>chooser</p>;
  return (
    <button
      type="button"
      onClick={() => void offerHeldScoresAfterPasscode('show-x').then(() => setMounted(false))}
    >
      Enter
    </button>
  );
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderPasscodeFlow() {
  return render(
    <>
      <SignInThatUnmounts />
      <HeldScoresPromptHost />
      <Where />
    </>,
    { initialRoute: '/at-show' }
  );
}

beforeEach(() => {
  useHeldScoresPromptStore.getState().setPrompt(null);
});

describe('asking after a passcode validates, above the sign-in page (MYK9-1205)', () => {
  it('goes straight to the show when nothing is held', async () => {
    held.count = 0;
    const { user } = renderPasscodeFlow();
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(await screen.findByText('chooser')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/at-show');
  });

  it('still asks after the sign-in page has unmounted, adopts, then lands on the show', async () => {
    const { user } = renderPasscodeFlow();
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(await screen.findByText('chooser')).toBeInTheDocument();
    const dialog = await screen.findByRole('alertdialog');
    expect(screen.getByTestId('where')).toHaveTextContent('/at-show');
    await user.click(within(dialog).getByRole('button', { name: 'Upload them' }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/at-show/show-x'));
    expect(held.adopt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('leaves the scores held and still lands on the show on "Not now"', async () => {
    const { user } = renderPasscodeFlow();
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Not now' })
    );

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/at-show/show-x'));
    expect(held.adopt).not.toHaveBeenCalled();
  });

  it('still lands on the show when adopting fails', async () => {
    held.adopt = vi.fn(async () => {
      throw new Error('boom');
    });
    const { user } = renderPasscodeFlow();
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Upload them' })
    );
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/at-show/show-x'));
  });
});
