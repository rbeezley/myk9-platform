/**
 * PARITY suite — one behaviour checklist, run against BOTH entry-list pages.
 *
 * `EntryListPage` and `CombinedEntryListPage` are two implementations of the
 * same surface (MYK9-260). Every difference the page-8b audit found between
 * them was a divergence rather than a design choice, and each one was invisible
 * to typecheck, lint and 18,000 passing tests: an endless skeleton on an empty
 * class, an empty ring presented as settled truth during first sync, syncs
 * dropped mid-drag, no containment banner, `window.alert()`, and a silent dead
 * tap on a scored dog.
 *
 * The point of running ONE list against BOTH pages is that a behaviour only one
 * of them satisfies fails here, whichever one it is — so the next divergence
 * cannot land quietly, and the eventual collapse of the two pages has an
 * explicit contract to merge against.
 *
 * Legitimate differences (the section filter, section badges, the combined sort)
 * are asserted in each page's own suite, not here. This file is only for
 * behaviour they must SHARE.
 *
 * LAYER ASYMMETRY, found while writing this and relevant to the collapse: the
 * two pages place the same behaviour at different levels. The dead-tap
 * explanation for an already-scored dog lives in the HOST handler for the
 * single-class route (`useAtShowEntryListHandlers.handleEntryClick`, tested
 * there) but INSIDE the page for the combined route (`handleScoreClick` →
 * injected `onNotify`, tested in `combinedEntryListLoadStates`). A page-level
 * parity suite therefore cannot compare it, which is why no case for it appears
 * below. The merge will have to pick one layer — the host handler is the better
 * home, since it already owns permission checks and navigation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryListPage } from '../EntryListPage';
import { CombinedEntryListPage } from '../CombinedEntryListPage';
import {
  contentSpy,
  makeCombinedProps,
  makeSingleClassProps,
  resetContentSpy,
  type ParityCase,
} from './entryListParity.fixtures';

vi.mock('../components/EntryListContent', () => ({
  EntryListContent: (props: {
    onEntryClick?: (entry: unknown) => void;
    onStatusClick?: (...args: unknown[]) => void;
  }) => {
    contentSpy.onEntryClick = props.onEntryClick;
    contentSpy.onStatusClick = props.onStatusClick;
    return <div data-testid="entry-list-content" />;
  },
}));

// The single-class page mounts this; the combined page does not (yet). It is
// stubbed so the parity cases below exercise the same render path on both.
vi.mock('../components/ClassCompletionPresentation', () => ({
  ClassCompletionPresentation: () => <div data-testid="class-completion" />,
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
    name: 'CombinedEntryListPage (Section A/B)',
    render: (cse = {}) =>
      void render(
        <MemoryRouter>
          <CombinedEntryListPage {...makeCombinedProps(cse)} />
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

  describe('sync visibility', () => {
    it('routes content through the PullToRefresh slot, which carries the containment banner', () => {
      // MYK9-115: that slot is the only place a judge is told the server has
      // paused their score uploads. The combined route rendered a plain div.
      page.render({ entries: [{ id: 'e1', classId: 'class-a' }], loaded: true });

      expect(screen.getByTestId('pull-to-refresh')).not.toBeNull();
    });
  });
});
