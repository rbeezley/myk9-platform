import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { AlreadyEnteredNotice } from '../AlreadyEnteredNotice';

/**
 * `ClassSelectionStep` is shared between the exhibitor wizard and the
 * secretary/admin registration flow, so this notice's recovery path must
 * follow the workflow mode. Codex review of PR #1456 caught the unconditional
 * version telling staff to "message the show team" — a link that opens a
 * thread whose participant is the staff user themselves.
 */
describe('AlreadyEnteredNotice', () => {
  it('points an exhibitor at the show team', () => {
    render(<AlreadyEnteredNotice showId="show-1" dogName="Willow" />);

    expect(screen.getByText(/Willow is already entered/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /message the show team/i });
    expect(link).toHaveAttribute('href', '/messages/show-1');
  });

  it.each(['secretary_existing', 'secretary_new', 'club_admin', 'site_admin'] as const)(
    'points %s staff at Entry Management, never at messaging themselves',
    mode => {
      render(<AlreadyEnteredNotice showId="show-1" dogName="Willow" workflowMode={mode} />);

      expect(screen.queryByRole('link', { name: /message the show team/i })).toBeNull();
      const link = screen.getByRole('link', { name: /entry management/i });
      expect(link).toHaveAttribute('href', '/shows/show-1/entry-management');
    }
  );

  it('defaults to the exhibitor path when no mode is supplied', () => {
    render(<AlreadyEnteredNotice showId="show-9" dogName="Rex" workflowMode="exhibitor" />);

    expect(screen.getByRole('link', { name: /message the show team/i })).toHaveAttribute(
      'href',
      '/messages/show-9'
    );
  });
});
