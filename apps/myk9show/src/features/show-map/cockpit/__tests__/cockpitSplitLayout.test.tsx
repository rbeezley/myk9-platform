import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import { COCKPIT_SPLIT_COLUMNS, COCKPIT_SPLIT_MIN_WIDTH } from '../cockpitSplit';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

// jsdom has no layout: feed the cockpit the width it would measure.
// One ref object, as the real hook's is stable, so the tests can see what it is attached to.
const cockpit = vi.hoisted(() => ({
  width: 700 as number | null,
  ref: { current: null as HTMLElement | null },
}));

vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: cockpit.ref, width: cockpit.width }),
}));
vi.mock('@/components/shows/tabs/setupClassSnapshot', () => ({
  resolveSetupClass: vi.fn(async (id: string) => ({ id, judgeId: null })),
}));
vi.mock('@/components/shows/tabs/SetupClassDialogs', () => ({
  SetupClassDialogs: ({ pending }: { pending: { action: string } }) => (
    <div data-testid="class-editor">{pending.action}</div>
  ),
}));

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [{ id: 'trial-1', date: '2026-07-20', number: 'Trial 1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice',
      classOrder: 0,
      lifecycle: 'not-started',
      entryCount: 4,
      scoredCount: 0,
      actions: [],
      attention: [],
      paperwork: [],
      entryRows: [],
    },
  ],
};

// Codex review of #2691: the focused panel moves between the inline and split
// layouts, which remounts it. An editor owned by the panel closed and lost its
// edits on a tablet rotation; the cockpit owns it now.
describe('the class editor survives the split/stack switch', () => {
  beforeEach(() => {
    cockpit.width = 700;
  });

  it('stays open when the cockpit widens past its split width', async () => {
    const { user, rerender } = render(
      <SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1' }
    );

    await user.click(screen.getByRole('button', { name: 'Edit class Container Novice' }));
    expect(await screen.findByTestId('class-editor')).toHaveTextContent('edit');

    expect(
      screen.getByTestId('secretary-cockpit').querySelector('[data-cockpit-layout]')
    ).toHaveAttribute('data-cockpit-layout', 'stacked');
    cockpit.width = 1000;
    rerender(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />);

    expect(screen.getByTestId('class-editor')).toHaveTextContent('edit');
    expect(screen.getByTestId('cockpit-split-focus')).toBeInTheDocument();
  });

  it.each([
    [1000, 'split'],
    [700, 'stacked'],
  ])(
    'scrolls a returning anchor once, in the measured %ipx (%s) layout, and not again while mounted',
    width => {
      const scrollIntoView = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        cockpit.width = null;
        const { rerender } = render(
          <SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />,
          { initialRoute: '/shows/show-1?focus=class-1&anchor=class-1' }
        );
        // The unmeasured first commit is stacked; the row would move once it measures.
        expect(scrollIntoView).not.toHaveBeenCalled();

        cockpit.width = width;
        rerender(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);

        // A tablet rotated later, untouched: the page stays where it is.
        cockpit.width = width === 1000 ? 700 : 1000;
        rerender(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    }
  );

  it('scrolls a returning anchor once when its row renders after the measurement', () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      cockpit.width = 1000;
      const empty = { ...snapshot, classes: [] };
      const { rerender } = render(
        <SecretaryCockpit snapshot={empty} canManageShow onCommand={vi.fn()} />,
        { initialRoute: '/shows/show-1?focus=class-1&anchor=class-1' }
      );
      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      rerender(<SecretaryCockpit snapshot={{ ...snapshot }} canManageShow onCommand={vi.fn()} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it.each([
    [COCKPIT_SPLIT_MIN_WIDTH, 'split'],
    [COCKPIT_SPLIT_MIN_WIDTH - 1, 'stacked'],
  ])('lays out a %ipx cockpit %s, whatever the window', (width, layout) => {
    cockpit.width = width;
    render(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />, {
      initialRoute: '/shows/show-1',
    });
    const grid = screen
      .getByTestId('secretary-cockpit')
      .querySelector<HTMLElement>('[data-cockpit-layout]');
    expect(grid).toHaveAttribute('data-cockpit-layout', layout);
    // The width that decides the layout is the grid's own.
    expect(cockpit.ref.current).toBe(grid);
    if (layout === 'split') {
      expect(grid?.style.gridTemplateColumns).toBe(COCKPIT_SPLIT_COLUMNS);
      expect(screen.getByTestId('cockpit-split-focus')).toBeInTheDocument();
      // Pinned while the schedule beside it scrolls.
      expect(screen.getByRole('complementary')).toHaveClass('sticky');
    } else {
      expect(grid?.style.gridTemplateColumns).toBe('');
      expect(screen.queryByTestId('cockpit-split-focus')).not.toBeInTheDocument();
      expect(screen.getByRole('complementary')).not.toHaveClass('sticky');
    }
  });
});
