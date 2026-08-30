/**
 * F4 — with no judges on the show, `SimpleClassSelector` rendered NO judge control at
 * all (the whole block sits behind `availableJudges.length > 0`). The wizard's class
 * step therefore offered no dropdown, no explanation and no way forward, while Review
 * still offered "Create & Publish".
 *
 * This component serves two callers — the creation wizard and Add Classes to Trial — so
 * both shapes of the escape hatch are asserted here.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';

import { SimpleClassSelector } from '../SimpleClassSelector';
import { getShowJudgesHref } from '@/components/shows/showEditRoutes';
import type { ClassTemplate } from '@/types/template.types';
import type { ShowJudgeAssignment } from '@/types/judge-types';

const TEMPLATE = {
  id: 'tpl-1',
  name: 'AKC Scent Work',
  classes: [
    { className: 'Container Novice A', element: 'Container', level: 'Novice', section: 'A' },
    { className: 'Interior Novice A', element: 'Interior', level: 'Novice', section: 'A' },
  ],
} as unknown as ClassTemplate;

const JUDGE = {
  judgeId: 'j1',
  judgeName: 'Pat Lee',
  assignedClasses: [],
} as unknown as ShowJudgeAssignment;

function renderSelector(props: Record<string, unknown> = {}) {
  return render(
    <SimpleClassSelector
      template={TEMPLATE}
      selectedClasses={[]}
      onSelectionChange={vi.fn()}
      availableJudges={[]}
      judgeAssignments={{}}
      onJudgeAssignmentChange={vi.fn()}
      {...props}
    />
  );
}

describe('SimpleClassSelector with no judges on the show', () => {
  it('explains the gap and links a saved show to its judge roster', () => {
    renderSelector({ addJudge: { showId: 'show-1' } });

    expect(screen.getByText(/no judges yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add a judge/i })).toHaveAttribute(
      'href',
      getShowJudgesHref('show-1')
    );
  });

  it('runs the caller action for an unsaved wizard show', async () => {
    // The wizard's show does not exist yet, so the notice must jump back to the step
    // that owns the roster rather than link to a route.
    const onAddJudge = vi.fn();
    renderSelector({ addJudge: { onAddJudge } });

    await userEvent.click(screen.getByRole('button', { name: /add a judge/i }));
    expect(onAddJudge).toHaveBeenCalledTimes(1);
  });

  it('says nothing once the show has a judge', () => {
    renderSelector({ availableJudges: [JUDGE], addJudge: { showId: 'show-1' } });

    expect(screen.queryByText(/no judges yet/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /add a judge/i })).toBeNull();
  });

  it('stays silent when the caller gave it no way out', () => {
    // Callers that cannot offer a route must not get a notice promising one.
    renderSelector();

    expect(screen.queryByText(/no judges yet/i)).toBeNull();
  });
});
