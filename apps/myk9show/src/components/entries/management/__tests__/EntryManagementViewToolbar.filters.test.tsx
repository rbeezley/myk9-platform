/**
 * The Entries toolbar (docs/plan-entries-filter-button.md, MYK9-1594): a quiet search and one
 * Filter button for Status, Trial and Class, the applied filters as sentences, and a plain
 * sentence with a "Show all forms" button that resets status, scope and search.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import { render, screen } from '@/test/utils/testUtils';
import { EntryManagementViewToolbar } from '../EntryManagementViewToolbar';
import type { EntryManagementCockpitState } from '../entryManagementCockpitParams';

const BASE_STATE: EntryManagementCockpitState = {
  tab: 'registrations',
  exception: 'move-ups',
  queues: ['all'],
  search: '',
  trialIds: [],
  classIds: [],
  registrationKey: null,
};

const QUEUE_COUNTS = { 'needs-review': 12, 'missing-information': 3, 'payment-due': 5, all: 214 };

function renderToolbar(
  overrides: Partial<EntryManagementCockpitState> = {},
  result: { shown: number; total: number } | null = { shown: 214, total: 214 }
) {
  const cockpit = {
    state: { ...BASE_STATE, ...overrides },
    groups: [],
    queueCounts: QUEUE_COUNTS,
    setQueues: vi.fn(),
    setScope: vi.fn(),
    setSearch: vi.fn(),
  };
  const onClearAll = vi.fn();
  const view = render(
    <EntryManagementViewToolbar
      cockpit={cockpit}
      trials={[{ id: 't1', name: 'Saturday', date: null, trial_number: 1 }]}
      trialsLoaded
      classes={{
        trialClasses: [{ id: 'c1', trialId: 't1', name: 'Novice A' }],
        classesLoaded: true,
        classTrialById: new Map([['c1', 't1']]),
        knownClassIds: new Set(['c1']),
      }}
      onClearAll={onClearAll}
      result={result}
    />
  );
  return { ...view, cockpit, onClearAll };
}

/** The result line's live region, not the applied-filter count's. */
function resultLine() {
  return screen
    .getAllByRole('status')
    .find(element => !/filters? applied/.test(element.textContent ?? ''));
}

describe('EntryManagementViewToolbar filters', () => {
  // cmdk scrolls the highlighted row into view; jsdom has no layout, so no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });
  // `mockViewportWidth` replaces `window.matchMedia`; put the setup's stub back so a narrow width
  // from one test cannot leave the search collapsed to an icon in the next (shuffled runs).
  const setupMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = setupMatchMedia;
  });

  it('on a phone or tablet it still reads "Showing all", since the one-row layout does not fit', () => {
    mockViewportWidth(768);
    renderToolbar();

    expect(resultLine()).toHaveTextContent('Showing all 214 forms.');
  });

  it('from lg it stays quiet, with no Show all button, when nothing narrows the list', () => {
    mockViewportWidth(1440);
    renderToolbar();

    // The live region stays mounted but empty, so the first search is still announced.
    expect(resultLine()?.textContent).toBe('');
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('is a search and a Filter button, with no Show: select, More menu or Add Entry button', () => {
    renderToolbar({ queues: ['needs-review', 'payment-due'] }, { shown: 15, total: 214 });

    expect(screen.getByRole('button', { name: /^Filter/ })).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Search exhibitor, dog, handler/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Trial' })).not.toBeInTheDocument();
  });

  it('says "Showing X of Y" with a count only, and Show all resets the applied state', async () => {
    const { user, onClearAll } = renderToolbar(
      { queues: ['needs-review'], trialIds: ['t1'] },
      { shown: 3, total: 214 }
    );

    expect(resultLine()?.textContent).toBe('Showing 3 of 214 forms.');
    await user.click(screen.getByRole('button', { name: 'Show all forms' }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it('counts a search as filtered too', () => {
    renderToolbar({ search: 'bob' }, { shown: 4, total: 214 });
    expect(resultLine()?.textContent).toBe('Showing 4 of 214 forms.');
  });

  it('shows no sentence until the entries have loaded', () => {
    renderToolbar({}, null);
    expect(resultLine()).toBeUndefined();
  });

  it('reads applied trials and classes as sentences, and the × writes both lists at once', async () => {
    const { user, cockpit } = renderToolbar({ trialIds: ['t1'], classIds: ['c1'] });

    expect(screen.getByText('Trial: Saturday')).toBeInTheDocument();
    expect(screen.getByText('Class: Novice A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove filter Trial: Saturday' }));

    // No trial left, so every class is offered again and the class pick stays.
    expect(cockpit.setScope).toHaveBeenCalledWith([], ['c1']);
  });

  it('offers Status, Trial and Class in the one Filter menu, with each status count', async () => {
    const { user } = renderToolbar();

    await user.click(screen.getByRole('button', { name: /^Filter/ }));

    expect(await screen.findByText('Status')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Needs review.*12/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Missing info.*3/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Payment due.*5/ })).toBeInTheDocument();
    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText('Class')).toBeInTheDocument();
  });

  it('picking a second status adds to the first, and the menu stays open', async () => {
    const { user, cockpit } = renderToolbar({ queues: ['needs-review'] });

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(await screen.findByRole('option', { name: /Payment due/ }));

    expect(cockpit.setQueues).toHaveBeenLastCalledWith(['needs-review', 'payment-due']);
    expect(screen.getByRole('option', { name: /Needs review/ })).toBeInTheDocument();
  });

  it('unticking the only status writes an empty list, which the cockpit reads as every form', async () => {
    const { user, cockpit } = renderToolbar({ queues: ['payment-due'] });

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(await screen.findByRole('option', { name: /Payment due/ }));

    expect(cockpit.setQueues).toHaveBeenLastCalledWith([]);
  });

  it('reads the picked statuses as one sentence, counts distinct forms, and counts as filtered', () => {
    renderToolbar({ queues: ['needs-review', 'payment-due'] }, { shown: 15, total: 214 });

    expect(screen.getByText('Status: Needs review, Payment due')).toBeInTheDocument();
    // 15 distinct forms in either queue, though the queues alone count 12 + 5 = 17.
    expect(resultLine()?.textContent).toBe('Showing 15 of 214 forms.');
  });

  it('opens unfiltered: no status sentence, and no Show all button from lg', () => {
    mockViewportWidth(1440);
    renderToolbar();

    expect(screen.queryByText(/^Status:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });
});
