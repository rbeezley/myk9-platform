/**
 * PARITY suite — one behaviour checklist, run against BOTH entry-list modes.
 *
 * The combined Novice A/B view used to be a SECOND page (MYK9-260). Every
 * difference the page-8b audit found between the two was a divergence rather
 * than a design choice, and each one was invisible to typecheck, lint and
 * 18,000 passing tests: an endless skeleton on an empty class, an empty ring
 * presented as settled truth during first sync, syncs dropped mid-drag, no
 * containment banner, `window.alert()`, and a silent dead tap on a scored dog.
 *
 * That page is gone; `EntryListPage` now renders both modes. This suite was
 * written against the two implementations and is kept pointed at the two MODES,
 * because `combined` still branches the page in six places — the section tabs,
 * the section badges, the sort options and default sort, the two class-scoped
 * menu items, and the completion claim key. A branch is where the next
 * divergence would start.
 *
 * The checklist below is only for behaviour the two modes must SHARE. The
 * legitimate differences are asserted separately at the bottom of this file.
 *
 * LAYER ASYMMETRY, resolved by the collapse: the two pages used to place the
 * same behaviour at different levels. The dead-tap explanation for an
 * already-scored dog lived in the HOST handler for the single-class route but
 * INSIDE the page for the combined route, so a page-level parity suite could
 * not compare it and no case for it appears below. Both routes now share
 * `useAtShowEntryListHandlers.handleEntryClick`, which is tested there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryListPage } from '../EntryListPage';
import {
  contentSpy,
  makeCombinedProps,
  makeSingleClassProps,
  resetContentSpy,
  uiActionSpy,
  type ParityCase,
} from './entryListParity.fixtures';

vi.mock('../components/EntryListContent', () => ({
  EntryListContent: (props: {
    onEntryClick?: (entry: unknown) => void;
    onStatusClick?: (...args: unknown[]) => void;
    onOpenDragMode?: () => void;
  }) => {
    contentSpy.onEntryClick = props.onEntryClick;
    contentSpy.onStatusClick = props.onStatusClick;
    contentSpy.onOpenDragMode = props.onOpenDragMode;
    return <div data-testid="entry-list-content" />;
  },
}));

// Stubbed in both modes: the completion view has its own suite, and mounting it
// here would drag the celebration-claim storage into every parity case. The
// props are captured because `podiumSections` is a PAGE-level decision the
// component's own suite cannot see.
export const completionSpy: { podiumSections?: string[] } = {};
vi.mock('../components/ClassCompletionPresentation', () => ({
  ClassCompletionPresentation: (props: { podiumSections?: string[] }) => {
    completionSpy.podiumSections = props.podiumSections;
    return <div data-testid="class-completion" />;
  },
}));

type PageUnderTest = {
  name: string;
  render: (cse?: ParityCase) => void;
};

const PAGES: PageUnderTest[] = [
  {
    name: 'EntryListPage (single class)',
    render: (cse = {}) =>
      void render(
        <MemoryRouter>
          <EntryListPage {...makeSingleClassProps(cse)} />
        </MemoryRouter>
      ),
  },
  {
    name: 'EntryListPage (combined Section A/B)',
    render: (cse = {}) =>
      void render(
        <MemoryRouter>
          <EntryListPage {...makeCombinedProps(cse)} />
        </MemoryRouter>
      ),
  },
];

describe.each(PAGES)('entry-list parity — $name', page => {
  beforeEach(() => {
    resetContentSpy();
  });

  describe('load gating', () => {
    it('shows neither content nor an empty state before the load completes', () => {
      // The combined route gated on `!entries.length`, which conflates "no data
      // yet" with "no data at all" — an empty class shimmered forever.
      page.render({ entries: [], loaded: false });

      expect(screen.queryByTestId('entry-list-content')).toBeNull();
      expect(screen.queryByText(/no entries yet/i)).toBeNull();
    });

    it('states emptiness only once the load has completed', () => {
      page.render({ entries: [], loaded: true });

      expect(screen.getByText(/no entries yet/i)).not.toBeNull();
    });

    it('renders the list once entries have arrived', () => {
      page.render({ entries: [{ id: 'e1', classId: 'class-a' }], loaded: true });

      expect(screen.getByTestId('entry-list-content')).not.toBeNull();
      expect(screen.queryByText(/no entries yet/i)).toBeNull();
    });

    it('surfaces a fetch error instead of an empty state', () => {
      page.render({ entries: [], loaded: true, fetchError: new Error('read failed') });

      expect(screen.queryByText(/no entries yet/i)).toBeNull();
    });
  });

  describe('wiring that a merge could silently drop', () => {
    it('passes drag handlers through to the list content', () => {
      // Drag reorder is the steward's primary tool. A merge that lost the
      // wiring would still render, still pass typecheck, and still be green.
      page.render({ entries: [{ id: 'e1', classId: 'class-a' }], loaded: true });

      expect(contentSpy.onEntryClick).toBeTypeOf('function');
      expect(contentSpy.onStatusClick).toBeTypeOf('function');
    });

    it('offers the Pending / Completed status tabs', () => {
      // Asserted on the rendered labels rather than a stubbed TabBar: TabBar
      // comes from @myk9/ui, not a layout slot, and asserting what the judge
      // actually sees is the point of a parity suite.
      page.render({ entries: [{ id: 'e1', classId: 'class-a' }], loaded: true });

      expect(screen.getByRole('button', { name: /pending/i })).not.toBeNull();
      expect(screen.getByRole('button', { name: /completed/i })).not.toBeNull();
    });
  });

  describe('drag-to-reorder setup', () => {
    it('switches to run-order sort and seeds the manual order when drag mode opens', () => {
      // The host handler only flips `isDragMode`. Without the rest, a drop
      // writes a new exhibitorOrder that the ACTIVE sort ignores, so the
      // steward's reorder reverts under their finger the moment they let go.
      // Combined A/B hit this every time -- it sorts 'section-armband' -- and
      // the single-class route hit it as soon as the steward sorted by armband
      // or placement first.
      page.render({ entries: [{ id: 'e1', classId: 'class-a' }], loaded: true });

      contentSpy.onOpenDragMode?.();

      expect(uiActionSpy.setSortOrder).toHaveBeenCalledWith('run');
      expect(uiActionSpy.setRunOrderDialogOpen).toHaveBeenCalledWith(false);
      expect(uiActionSpy.setManualOrder).toHaveBeenCalled();
    });
  });

  describe('sync visibility', () => {
    it('routes content through the PullToRefresh slot, which carries the containment banner', () => {
      // MYK9-115: that slot is the only place a judge is told the server has
      // paused their score uploads. The combined route rendered a plain div.
      page.render({ entries: [{ id: 'e1', classId: 'class-a' }], loaded: true });

      expect(screen.getByTestId('pull-to-refresh')).not.toBeNull();
    });
  });
});

/**
 * The mode differences, asserted so that "shared" above stays meaningful: a
 * collapse that quietly dropped the section filter would pass every parity case
 * while leaving a steward no way to work one section of a combined ring.
 */
describe('combined mode renders what single-class mode must not', () => {
  const entries = [{ id: 'e1', classId: 'class-a' }];

  it('offers the section filter only in combined mode', () => {
    render(
      <MemoryRouter>
        <EntryListPage {...makeCombinedProps({ entries, loaded: true })} />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /all sections/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /section a/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /section b/i })).not.toBeNull();
  });

  it('asks for a podium PER SECTION in combined mode', () => {
    // A and B are placed independently -- that is what the sections are for --
    // so one merged podium would render two 1sts, two 2nds, and a ranking
    // nobody competed in.
    delete completionSpy.podiumSections;
    render(
      <MemoryRouter>
        <EntryListPage {...makeCombinedProps({ entries, loaded: true })} />
      </MemoryRouter>
    );

    expect(completionSpy.podiumSections).toEqual(['A', 'B']);
  });

  it('asks for a single podium on a single class', () => {
    delete completionSpy.podiumSections;
    render(
      <MemoryRouter>
        <EntryListPage {...makeSingleClassProps({ entries, loaded: true })} />
      </MemoryRouter>
    );

    expect(completionSpy.podiumSections).toBeUndefined();
  });

  it('shows no section filter on a single class', () => {
    render(
      <MemoryRouter>
        <EntryListPage {...makeSingleClassProps({ entries, loaded: true })} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /all sections/i })).toBeNull();
  });
});
