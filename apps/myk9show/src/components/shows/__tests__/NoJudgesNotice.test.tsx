/**
 * F4/F12 — the shared way out of the "no judges to assign" dead end.
 *
 * The property under test is that the notice always offers an ACTION. A message that
 * only restates the problem is what the app already did in three of the four places
 * ("No judges assigned to this show", as a disabled option), and it is why the finding
 * exists.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';

import { NoJudgesNotice } from '../NoJudgesNotice';
import { getShowJudgesHref } from '../showEditRoutes';

describe('NoJudgesNotice', () => {
  it('links a saved show to the tab that owns its judge roster', () => {
    render(<NoJudgesNotice showId="show-1" />);

    const link = screen.getByRole('link', { name: /add a judge/i });
    expect(link).toHaveAttribute('href', getShowJudgesHref('show-1'));
  });

  it('runs an action instead when the show has no id yet', async () => {
    // The creation wizard's show is unsaved, so there is no route to link to — the
    // roster lives on an earlier step of the same form.
    const onAddJudge = vi.fn();
    render(<NoJudgesNotice onAddJudge={onAddJudge} />);

    await userEvent.click(screen.getByRole('button', { name: /add a judge/i }));
    expect(onAddJudge).toHaveBeenCalledTimes(1);
  });

  it('explains why nothing can be assigned, not merely that nothing is', () => {
    render(<NoJudgesNotice showId="show-1" />);

    expect(screen.getByText(/no judges yet/i)).toBeInTheDocument();
    expect(screen.getByText(/offered here/i)).toBeInTheDocument();
  });

  it('lets a caller supply wording that fits its surface', () => {
    render(
      <NoJudgesNotice showId="show-1" message="No judges on this show yet." actionLabel="Add one" />
    );

    expect(screen.getByText('No judges on this show yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add one' })).toBeInTheDocument();
  });
});
