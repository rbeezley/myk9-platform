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

    // Regression guard: `.l-hdr-nav` is display:none below 640px, so the link
    // must NOT live inside it or phone users lose discovery. It must be a
    // persistent header button alongside Sign in. (jsdom can't evaluate the
    // media query, so we assert structure instead.)
    expect(browse.closest('.l-hdr-nav')).toBeNull();
    expect(browse).toHaveClass('l-btn');
  });

  it('still offers sign-in and waitlist entry points', () => {
    const onJoinWaitlistClick = vi.fn();
    render(<LandingHeader onJoinWaitlistClick={onJoinWaitlistClick} />);

    const signIn = screen.getByRole('link', { name: /sign in/i });
    expect(signIn).toHaveAttribute('href', '/sign-in');
    expect(signIn).toHaveClass('l-signin-btn');
    screen.getByRole('button', { name: /join the waitlist/i }).click();
    expect(onJoinWaitlistClick).toHaveBeenCalledTimes(1);
  });
});
