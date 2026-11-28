import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { ClubOverviewVideo } from '../ClubOverviewVideo';

describe('ClubOverviewVideo', () => {
  // MYK9-2517 (owner, 2026-11-27): a show is not paperless (the gate's run sheet and the judge's
  // scoresheets stay), so the page promises less retyping, never less paper.
  it('promises less retyping, and does not say the paperwork goes away', () => {
    const { container } = render(<ClubOverviewVideo />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Run your trials without the retyping.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Play the video: myK9Show for clubs: run your trials without the retyping',
      })
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/paperwork|paperless/i);
  });

  it('loads nothing from YouTube until play is pressed', () => {
    const { container } = render(<ClubOverviewVideo />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute(
      'href',
      'https://youtu.be/bAQBMxBGSkw'
    );
  });

  it('plays the club overview from the privacy-enhanced domain with captions on', async () => {
    const user = userEvent.setup();
    const { container } = render(<ClubOverviewVideo />);
    await user.click(screen.getByRole('button', { name: /Play the video/ }));
    const frame = container.querySelector('iframe');
    expect(frame).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/bAQBMxBGSkw?autoplay=1&cc_load_policy=1&rel=0'
    );
    expect(frame).toHaveAttribute('title', expect.stringContaining('run your trials'));
    // autoplay=1 is ignored by the browser unless the frame is allowed to autoplay.
    expect(frame?.getAttribute('allow')?.split(/;\s*/)).toContain('autoplay');
    // The button the visitor pressed is gone, so focus moves to the player.
    expect(frame).toHaveFocus();
    // Still reachable by Tab afterwards: an iframe is focusable by default.
    expect(frame).not.toHaveAttribute('tabindex', '-1');
  });
});
