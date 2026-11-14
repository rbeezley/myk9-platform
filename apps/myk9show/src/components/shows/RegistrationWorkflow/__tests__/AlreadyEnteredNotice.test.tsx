import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { AlreadyEnteredNotice } from '../AlreadyEnteredNotice';

/**
 * `ClassSelectionStep` is shared between the exhibitor wizard and the
 * secretary/admin registration flow, so this notice's recovery path must
 * follow the workflow mode. Codex review of PR #1456 caught the unconditional
 * version telling staff to "message the show secretary" — a link that opens a
 * thread whose participant is the staff user themselves.
 */
describe('AlreadyEnteredNotice', () => {
  it('points an exhibitor at My Shows, where she can change or withdraw an entry herself', () => {
    render(<AlreadyEnteredNotice showId="show-1" dogName="Willow" />);

    expect(screen.getByText(/Willow is already entered/i)).toBeInTheDocument();
    expect(screen.getByText(/To change or withdraw this entry, open it in/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'My Shows' });
    expect(link).toHaveAttribute('href', '/exhibitor/entries');
    expect(screen.queryByRole('link', { name: /message the show secretary/i })).toBeNull();
  });

  it.each(['secretary_new', 'club_admin', 'site_admin'] as const)(
    'points %s staff at Entry Forms, never at messaging themselves',
    mode => {
      render(<AlreadyEnteredNotice showId="show-1" dogName="Willow" workflowMode={mode} />);

      expect(screen.queryByRole('link', { name: /message the show secretary/i })).toBeNull();
      const link = screen.getByRole('link', { name: /entry forms/i });
      expect(link).toHaveAttribute('href', '/shows/show-1/entries');
    }
  );

  it('defaults to the exhibitor path when no mode is supplied', () => {
    render(<AlreadyEnteredNotice showId="show-9" dogName="Rex" />);

    expect(screen.getByRole('link', { name: 'My Shows' })).toHaveAttribute(
      'href',
      '/exhibitor/entries'
    );
  });
});
