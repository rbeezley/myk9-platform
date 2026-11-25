import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { ClubOverviewVideo } from '../ClubOverviewVideo';

describe('ClubOverviewVideo', () => {
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
  });
});
