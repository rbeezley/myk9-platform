import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { SetupAdaptiveHeader } from '../SetupAdaptiveHeader';

describe('SetupAdaptiveHeader', () => {
  it('renders the ready state when signals is empty', () => {
    render(<SetupAdaptiveHeader signals={[]} />);
    expect(screen.getByRole('heading', { name: 'Setup ready' })).toBeInTheDocument();
    expect(screen.queryByTestId('setup-signals')).not.toBeInTheDocument();
  });

  it('renders each pending signal as a link to its fixing surface', () => {
    render(
      <SetupAdaptiveHeader
        signals={[
          { id: 'no-trials', label: 'No trials yet', href: '/shows/s1?tab=trials' },
          { id: 'judges-missing', label: 'Judges not assigned', href: '/trials/t1/classes' },
        ]}
      />
    );
    expect(screen.getByRole('heading', { name: 'Finish setup' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'No trials yet' })).toHaveAttribute(
      'href',
      '/shows/s1?tab=trials'
    );
    expect(screen.getByRole('link', { name: 'Judges not assigned' })).toHaveAttribute(
      'href',
      '/trials/t1/classes'
    );
  });

  it('renders hash signals as in-page anchors', () => {
    render(
      <SetupAdaptiveHeader
        signals={[
          {
            id: 'exhibitor-materials-unpublished',
            label: 'Premium list not posted yet',
            href: '#setup-publish',
          },
        ]}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Premium list not posted yet' })
    ).toHaveAttribute('href', '#setup-publish');
  });

  it('uses singular vs plural copy correctly', () => {
    const { rerender } = render(
      <SetupAdaptiveHeader
        signals={[{ id: 'no-trials', label: 'No trials yet', href: '/shows/s1?tab=trials' }]}
      />
    );
    expect(screen.getByText(/1 item left/i)).toBeInTheDocument();

    rerender(
      <SetupAdaptiveHeader
        signals={[
          { id: 'no-trials', label: 'No trials yet', href: '/shows/s1?tab=trials' },
          { id: 'no-classes', label: 'No classes built', href: '/trials/t1/classes' },
        ]}
      />
    );
    expect(screen.getByText(/2 items left/i)).toBeInTheDocument();
  });
});
