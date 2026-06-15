import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { LandingHeader } from './LandingHeader';

describe('LandingHeader', () => {
  it('surfaces a Browse shows link to the public /shows route (UX-P2-05)', () => {
    render(<LandingHeader onJoinWaitlistClick={() => {}} />);

    // Cold-start exhibitors must be able to reach show discovery without first
    // signing in or joining the waitlist.
    const browse = screen.getByRole('link', { name: /browse shows/i });
    expect(browse).toHaveAttribute('href', '/shows');
  });

  it('still offers sign-in and waitlist entry points', () => {
    const onJoinWaitlistClick = vi.fn();
    render(<LandingHeader onJoinWaitlistClick={onJoinWaitlistClick} />);

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
    screen.getByRole('button', { name: /join the waitlist/i }).click();
    expect(onJoinWaitlistClick).toHaveBeenCalledTimes(1);
  });
});
