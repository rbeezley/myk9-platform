import { createDatabaseError } from '@/services/database/databaseError';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

import { render } from '@/test/utils/testUtils';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

import ShowDeskPanel from '../ShowDeskPanel';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  createDatabaseError,
}));
vi.mock('@/services/database/day-of-operations', () => ({}));
vi.mock('@/services/database/entries/lifecycle', () => ({}));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(() => () => undefined),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn(), subscribe: vi.fn(() => () => undefined) },
  replicatedPaperworkPrintsTable: {
    subscribe: vi.fn(() => () => undefined),
    sync: vi.fn(async () => ({ success: true })),
    getByShow: vi.fn(async () => []),
    voidPrint: vi.fn(async () => undefined),
  },
}));
vi.mock('@/store/messageStore', () => ({
  useMessageStore: (
    selector: (state: {
      getOrCreateThread: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    }) => unknown
  ) => selector({ getOrCreateThread: vi.fn(), sendMessage: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// jsdom has no layout: the cockpit splits on its own measured width (cockpitSplit.ts), so a test
// sets the width it would measure. Null (unmeasured) is the stacked layout.
const cockpitWidth = vi.hoisted(() => ({ value: null as number | null }));
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: cockpitWidth.value }),
}));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-06-12',
  endDate: '2026-06-14',
} as Show;

const trial = fromAny<SyncableTrial, unknown>({
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  name: 'Friday AM',
  trialDate: '2026-06-12',
  trialNumber: 'Friday AM',
  timezone: 'America/New_York',
  order: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
});

const now = new Date('2026-06-12T15:00:00.000Z');

describe('ShowDeskPanel cockpit', () => {
  // cmdk (the Filter menu) scrolls rows into view; jsdom has no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('places filters over a Trial-grouped schedule and focuses a selected Class', async () => {
    const { user } = render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Container Novice',
            status: 'Scheduled',
            time: '9:00 AM',
          },
          {
            id: 'class-2',
            trialId: 'trial-1',
            name: 'Interior Advanced',
            status: 'In Progress',
            time: '10:00 AM',
          },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day' }
    );

    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Schedule filters/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^(Collapse|Expand) Friday AM · June 12/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Selected class · Friday AM')).not.toHaveLength(0);
    expect(screen.getAllByRole('heading', { name: 'Interior Advanced' })).not.toHaveLength(0);

    await user.click(screen.getByText('Container Novice'));
    expect(screen.getAllByRole('heading', { name: 'Container Novice' })).not.toHaveLength(0);
  });

  it('writes focus and anchor into owner-page return links (All days leaves day unset)', async () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
          { id: 'class-2', trialId: 'trial-1', name: 'Interior Advanced', status: 'In Progress' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day' }
    );

    const entriesLink = await screen.findAllByRole('link', { name: /view entries and results/i });
    expect(decodeURIComponent(entriesLink[0]?.getAttribute('href') ?? '')).toContain(
      'returnTo=/shows/show-1/show-day?focus=class-2&anchor=class-2'
    );
  });

  it('keeps Trial summaries and deliberate focus while collapsing and filtering the schedule', async () => {
    const { user } = render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Container Novice',
            status: 'Scheduled',
            time: '9:00 AM',
          },
          {
            id: 'class-2',
            trialId: 'trial-1',
            name: 'Interior Advanced',
            status: 'In Progress',
            time: '10:00 AM',
          },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day?focus=class-1' }
    );

    const trialTrigger = screen.getByRole('button', {
      name: /^(Collapse|Expand) Friday AM · June 12/i,
    });
    expect(trialTrigger).toHaveTextContent('2 classes (1 in progress)');
    await user.click(trialTrigger);
    expect(screen.queryByRole('button', { name: 'Container Novice' })).not.toBeInTheDocument();

    await user.click(trialTrigger);
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('option', { name: /^In progress/ }));
    expect(screen.queryByRole('button', { name: 'Container Novice' })).not.toBeInTheDocument();
    // MYK9-1727: a filter change that hides the picked class lets it go, so it is not left open
    // beside a list that hides it; the in-progress class becomes the default.
    expect(screen.queryByRole('heading', { name: 'Container Novice' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Interior Advanced' })).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Remove filter Status: In progress' }));
    expect(screen.getByRole('button', { name: 'Container Novice' })).toBeInTheDocument();
  });

  it('mounts the focused Class panel once, inline, on a narrow viewport', async () => {
    const { user } = render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
          { id: 'class-2', trialId: 'trial-1', name: 'Interior Advanced', status: 'In Progress' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day?focus=class-1' }
    );

    expect(
      within(screen.getByTestId('cockpit-inline-focus')).getByRole('heading', {
        name: 'Container Novice',
      })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('cockpit-split-focus')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Container Novice' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Interior Advanced' }));
    expect(
      within(screen.getByTestId('cockpit-inline-focus')).getByRole('heading', {
        name: 'Interior Advanced',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('cockpit-inline-focus')).toHaveLength(1);
  });

  it('mounts the focused Class panel once, in the split column, on a wide cockpit', () => {
    cockpitWidth.value = 1000;

    try {
      render(
        <ShowDeskPanel
          show={show}
          trials={[trial]}
          classes={[
            { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
            { id: 'class-2', trialId: 'trial-1', name: 'Interior Advanced', status: 'In Progress' },
          ]}
          entries={[]}
          canManageShow
          scopeNow={now}
        />,
        { initialRoute: '/shows/show-1/show-day?focus=class-1' }
      );

      expect(
        within(screen.getByTestId('cockpit-split-focus')).getByRole('heading', {
          name: 'Container Novice',
        })
      ).toBeInTheDocument();
      expect(screen.queryByTestId('cockpit-inline-focus')).not.toBeInTheDocument();
      expect(screen.getAllByRole('heading', { name: 'Container Novice' })).toHaveLength(1);
    } finally {
      cockpitWidth.value = null;
    }
  });

  // MYK9-1727: the Filter row sits under the schedule heading, and while a filter is on the
  // heading's how-to line becomes "Showing N of M classes." with a way back to all of them.
  it('puts the Filter under the schedule heading and says how many classes are showing', async () => {
    const { user } = render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
          { id: 'class-2', trialId: 'trial-1', name: 'Interior Advanced', status: 'In Progress' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day?filter=in-progress' }
    );

    const heading = screen.getByRole('region', { name: /^(Show|Today's) schedule$/ });
    expect(within(heading).getByRole('button', { name: /^Filter/ })).toBeInTheDocument();
    expect(within(heading).getByText('Showing 1 of 2 classes.')).toBeInTheDocument();
    expect(
      screen.queryByText(/Pick a class to see its checklist\. Filters/)
    ).not.toBeInTheDocument();

    await user.click(within(heading).getByRole('button', { name: 'Show all classes' }));
    expect(screen.queryByText(/^Showing /)).not.toBeInTheDocument();
    expect(screen.getByText(/Pick a class to see its checklist\. Filters/)).toBeInTheDocument();
  });

  // MYK9-1727: a class that is only in the URL (not clicked this visit) and that the filter hides
  // leaves a prompt, not its panel. A clicked class staying open is cockpitFocusRules.test.ts.
  // MYK9-1727 review: the secretary's own work (here, completing the class) moves her clicked
  // class out of "In progress"; it stays open, saying why it left the list.
  it('keeps a clicked class open when its own change takes it out of the filter', async () => {
    const classesWith = (status: string) => [
      { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'In Progress' },
      { id: 'class-2', trialId: 'trial-1', name: 'Interior Advanced', status },
    ];
    const panel = (status: string) => (
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={classesWith(status)}
        entries={[]}
        canManageShow
        scopeNow={now}
      />
    );
    const { user, rerender } = render(panel('In Progress'), {
      initialRoute: '/shows/show-1/show-day?filter=in-progress',
    });
    await user.click(screen.getByRole('button', { name: 'Interior Advanced' }));

    rerender(panel('Completed'));
    expect(screen.queryByRole('button', { name: 'Interior Advanced' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Interior Advanced' })).not.toHaveLength(0);
    expect(screen.getByText(/no longer matches your filter/)).toBeInTheDocument();
  });

  it('shows a pick-a-class prompt when the filter hides a class the URL names', () => {
    cockpitWidth.value = 1000;
    onTestFinished(() => {
      cockpitWidth.value = null;
    });
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
          { id: 'class-2', trialId: 'trial-1', name: 'Interior Advanced', status: 'In Progress' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day?focus=class-1&filter=in-progress' }
    );

    expect(screen.queryByTestId('cockpit-split-focus')).not.toBeInTheDocument();
    expect(screen.getByTestId('cockpit-split-empty')).toHaveTextContent(
      'Pick a class from the schedule to see its checklist.'
    );
  });

  it('shows no pick-a-class prompt beside a schedule the filter has emptied', () => {
    cockpitWidth.value = 1000;
    onTestFinished(() => {
      cockpitWidth.value = null;
    });
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day?filter=in-progress' }
    );

    expect(screen.getByText('No classes match this filter.')).toBeInTheDocument();
    expect(screen.queryByTestId('cockpit-split-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cockpit-split-focus')).not.toBeInTheDocument();
  });

  it('restores the URL-backed schedule anchor without changing Class focus', async () => {
    cockpitWidth.value = 700;
    onTestFinished(() => {
      cockpitWidth.value = null;
    });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
          { id: 'class-2', trialId: 'trial-1', name: 'Interior Advanced', status: 'In Progress' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day?focus=class-2&anchor=class-1' }
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
    expect(screen.getAllByRole('heading', { name: 'Interior Advanced' })).not.toHaveLength(0);
  });

  it('uses plain words in the setup note and the schedule hint (MYK9-1282)', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[{ ...trial, status: 'Scheduled' } as SyncableTrial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={new Date('2026-06-01T15:00:00.000Z')}
      />,
      { initialRoute: '/shows/show-1/show-day' }
    );

    expect(screen.getByText(/Pick a class to see its checklist/)).toBeInTheDocument();
    expect(screen.queryByText(/Select a Class to focus it/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Show-day work has not started. Entries are on the Entry Forms tab, and show setup is here on Show Desk.'
      )
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/their normal pages/);
  });

  it('keeps Class work available even when it is not an attention item', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day?focus=class-1' }
    );

    expect(screen.getAllByRole('link', { name: /view entries and results/i })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/trials/trial-1/classes/class-1')
    );
    expect(
      screen.getAllByRole('link', { name: /enter results from scoresheet/i })[0]
    ).toHaveAttribute('href', expect.stringContaining('/scoring/classes/class-1/entries'));
    // MYK9-1324: the panel's "Class setup" link went with the Select classes table; the
    // panel itself has Edit class and the judge picker, and Select classes is the schedule's.
    expect(screen.queryByRole('link', { name: /class setup/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /run order and class setup/i })).toBeNull();
    expect(screen.getAllByRole('link', { name: /class reports/i })).not.toHaveLength(0);
  });

  it('renders no Your show button row: setup verbs live in Actions, scoring in Class work (MYK9-1317)', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
          { id: 'class-2', trialId: 'trial-1', name: 'Container Advanced', status: 'Scheduled' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1' }
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Your show' })).toBeInTheDocument();
    for (const name of [/^add trial$/i, /^select classes$/i]) {
      expect(screen.queryByRole('link', { name })).toBeNull();
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    // Paper scoring is per class: the one door is the focused class's Class work, never a
    // show-level button that would have needed a class picker.
    const paperDoors = screen.getAllByRole('link', { name: /^enter results from scoresheet$/i });
    expect(paperDoors).toHaveLength(1);
    expect(paperDoors[0]).toHaveAttribute('href', expect.stringContaining('/scoring/classes/'));
  });

  it('deep-links actionable entry attention to its canonical owner page', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
        ]}
        entries={[
          { id: 'entry-1', class_id: 'class-1', entry_status: 'submitted', check_in_status: null },
        ]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day?focus=class-1&filter=all' }
    );

    const reviewLink = screen
      .getAllByRole('link')
      .find(link => link.getAttribute('href')?.includes('attention=pending'));
    expect(reviewLink).toHaveAttribute('href', expect.stringContaining('/entries'));
    expect(reviewLink).toHaveAttribute('href', expect.stringContaining('returnTo='));
    expect(decodeURIComponent(reviewLink?.getAttribute('href') ?? '')).toContain(
      'focus=class-1&anchor=class-1'
    );
  });

  it('opens Results from the close-out attention pill (MYK9-1727)', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Container Novice',
            status: 'Complete',
            judgeSignedOffAt: '2026-06-12T14:30:00.000Z',
          },
        ]}
        entries={[{ id: 'entry-1', class_id: 'class-1', is_scored: true }]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-day' }
    );

    const link = screen.getAllByRole('link', { name: /close out 1 result/i })[0];
    expect(link).toHaveAccessibleName('Close out 1 result, opens Results');
    expect(link?.getAttribute('href')).toMatch(/^\/shows\/show-1\/results\?returnTo=/);
  });

  it('hides staff entry attention when the viewer cannot manage the Show', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' },
        ]}
        entries={[{ id: 'entry-1', class_id: 'class-1', entry_status: 'submitted' }]}
        canManageShow={false}
        scopeNow={now}
      />
    );

    expect(screen.queryByText('Review 1 entry')).not.toBeInTheDocument();
  });
});
