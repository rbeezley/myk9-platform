import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { VolunteersCard } from '../VolunteersCard';

describe('VolunteersCard', () => {
  it('renders the heading and a link to the volunteer scheduling page', () => {
    render(<VolunteersCard />);

    expect(screen.getByRole('heading', { name: 'Volunteers' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /open volunteer scheduling/i });
    expect(link).toHaveAttribute('href', '/secretary/volunteers');
  });

  it('appends ?showId= when a showId is provided', () => {
    // Regression: without this query param, a click from the workbench would
    // land on whichever show selectedShowId happened to point to (which
    // can be stale / a different show in a multi-show account).
    render(<VolunteersCard showId="show-abc-123" />);

    const link = screen.getByRole('link', { name: /open volunteer scheduling/i });
    expect(link).toHaveAttribute('href', '/secretary/volunteers?showId=show-abc-123');
  });

  it('encodes special characters in the showId', () => {
    render(<VolunteersCard showId="show with space" />);

    const link = screen.getByRole('link', { name: /open volunteer scheduling/i });
    expect(link).toHaveAttribute(
      'href',
      '/secretary/volunteers?showId=show%20with%20space'
    );
  });
});
