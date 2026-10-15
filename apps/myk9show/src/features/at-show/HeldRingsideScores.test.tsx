import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { useHeldScoresAfterPasscode } from '@/pages/useHeldScoresAfterPasscode';
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

function PasscodeHarness({ proceed }: { proceed: (showId: string) => void }) {
  const { offer, dialog } = useHeldScoresAfterPasscode(proceed);
  return (
    <>
      <button
        type="button"
        onClick={() => void offer('show-x').then(asked => asked || proceed('show-x'))}
      >
        Enter
      </button>
      {dialog}
    </>
  );
}

describe('asking after a passcode validates (MYK9-1205)', () => {
  it('goes straight to the show when nothing is held', async () => {
    held.count = 0;
    const proceed = vi.fn();
    const { user } = render(<PasscodeHarness proceed={proceed} />);
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    await waitFor(() => expect(proceed).toHaveBeenCalledExactlyOnceWith('show-x'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('adopts, then goes to the show once, on "Upload them"', async () => {
    const proceed = vi.fn();
    const { user } = render(<PasscodeHarness proceed={proceed} />);
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(proceed).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Upload them' }));

    await waitFor(() => expect(proceed).toHaveBeenCalledExactlyOnceWith('show-x'));
    expect(held.adopt).toHaveBeenCalledTimes(1);
  });

  it('leaves the scores held and still goes to the show, once, on "Not now"', async () => {
    const proceed = vi.fn();
    const { user } = render(<PasscodeHarness proceed={proceed} />);
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Not now' })
    );

    await waitFor(() => expect(proceed).toHaveBeenCalledExactlyOnceWith('show-x'));
    expect(held.adopt).not.toHaveBeenCalled();
  });

  it('still goes to the show when adopting fails', async () => {
    held.adopt = vi.fn(async () => {
      throw new Error('boom');
    });
    const proceed = vi.fn();
    const { user } = render(<PasscodeHarness proceed={proceed} />);
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Upload them' })
    );
    await waitFor(() => expect(proceed).toHaveBeenCalledExactlyOnceWith('show-x'));
  });
});
