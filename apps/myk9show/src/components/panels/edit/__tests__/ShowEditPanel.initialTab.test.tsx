/**
 * F4/F12 — the deep link's tab is a ONE-SHOT instruction, not a preference.
 *
 * Codex raised this as a defect: `initialTab` only seeds `useState`, so if the panel's
 * children stayed mounted while closed, reopening from the menu would still show Judges.
 * They do not — `SlideOverPanel` returns null when closed and not animating, so the form
 * unmounts and re-seeds. This test pins that, because the claim rests on a detail two
 * components away that a future change to SlideOverPanel could silently break.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

import { ShowEditPanel } from '../ShowEditPanel';
import { ClassEditPanel } from '../ClassEditPanel';

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));

const baseProps = {
  showId: 'show-1',
  showName: 'Heartland',
  initialShowData: { id: 'show-1', name: 'Heartland', organization: 'AKC' },
  onSave: vi.fn(),
};

function selectedTabName() {
  const selected = screen.queryAllByRole('tab', { selected: true });
  return selected.map(t => t.textContent ?? '').join(' ');
}

describe('the Judges tab when no qualified judges exist', () => {
  it('offers a route to where qualifications are managed', () => {
    // Codex, round 1: the "Add a judge" link lands here, and this empty state used to
    // be prose ending "...add judge qualifications to people in the Users section" --
    // naming a screen with no way to reach it. The dead end had simply moved one hop.
    render(<ShowEditPanel open onClose={vi.fn()} initialTab="judges" {...baseProps} />);

    expect(screen.getByText(/no qualified judges found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage judge qualifications/i })).toHaveAttribute(
      'href',
      '/people'
    );
  });
});

describe('ShowEditPanel initialTab', () => {
  it('opens on the deep-linked tab', () => {
    render(<ShowEditPanel open onClose={vi.fn()} initialTab="judges" {...baseProps} />);
    expect(selectedTabName()).toMatch(/judges/i);
  });

  it('opens on Basic Info by default', () => {
    render(<ShowEditPanel open onClose={vi.fn()} {...baseProps} />);
    expect(selectedTabName()).toMatch(/basic/i);
  });

  it('does not keep Judges selected when reopened without the deep link', () => {
    // Close, then reopen with the default tab -- the panel must not remember the
    // one-shot deep link from the previous session.
    const { rerender } = render(
      <ShowEditPanel open onClose={vi.fn()} initialTab="judges" {...baseProps} />
    );
    expect(selectedTabName()).toMatch(/judges/i);

    rerender(<ShowEditPanel open={false} onClose={vi.fn()} initialTab="basic" {...baseProps} />);
    rerender(<ShowEditPanel open onClose={vi.fn()} initialTab="basic" {...baseProps} />);

    expect(selectedTabName()).toMatch(/basic/i);
    expect(selectedTabName()).not.toMatch(/judges/i);
  });
});

/**
 * Codex, round 2 — replacing the judge Select outright when the roster is empty
 * stranded a STALE assignment: a class that still records a judge who has since been
 * removed from the show had no control left, so TBD (the only way to clear it) was
 * unreachable. The notice must sit ALONGSIDE the control in that case, not instead of it.
 */
describe('class Edit panel with an empty roster', () => {
  const classProps = {
    classId: 'c1',
    className: 'Interior',
    showId: 'show-1',
    onSave: vi.fn(),
  };

  it('keeps a clearable control when a stale judge is still recorded', () => {
    render(
      <ClassEditPanel
        open
        onClose={vi.fn()}
        {...classProps}
        initialClassData={{ id: 'c1', judgeId: 'judge-gone', judgeName: 'Removed Judge' }}
      />
    );

    // The notice explains the empty roster...
    expect(screen.getByText(/no judges on this show yet/i)).toBeInTheDocument();
    // ...and the control survives so the stale assignment can be cleared.
    expect(screen.getByRole('combobox', { name: /judge/i })).toBeInTheDocument();
  });

  it('drops the control when there is nothing to clear', () => {
    render(
      <ClassEditPanel
        open
        onClose={vi.fn()}
        {...classProps}
        initialClassData={{ id: 'c1', judgeId: '' }}
      />
    );

    expect(screen.getByText(/no judges on this show yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /judge/i })).toBeNull();
  });
});
