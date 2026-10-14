import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { LandingHeader } from '../LandingHeader';

describe('LandingHeader', () => {
  it('surfaces a Find a show link to the public /shows route', () => {
    render(<LandingHeader />);

    // Cold-start exhibitors must be able to reach show discovery without first
    // signing in or requesting club onboarding.
    const find = screen.getByRole('link', { name: 'Find a show' });
    expect(find).toHaveAttribute('href', '/shows');
    expect(find).toHaveClass('l-btn');
    expect(find).not.toHaveClass('l-btn-primary');
  });

  it('offers sign-in and Add your club as the filled primary action', () => {
    render(<LandingHeader />);

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
    const club = screen.getByRole('link', { name: 'Add your club' });
    expect(club).toHaveAttribute('href', '#get-started');
    expect(club).toHaveClass('l-btn-primary');
  });

  it('leads with a free account for a guest reading the exhibitor story', () => {
    render(<LandingHeader audience="exhibitor" />);
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/sign-up'
    );
    expect(screen.queryByRole('link', { name: 'Add your club' })).toBeNull();
  });

  it('hides Sign in for a signed-in visitor but keeps Add your club', () => {
    render(<LandingHeader signedIn />);

    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your club' })).toBeInTheDocument();
  });
});
