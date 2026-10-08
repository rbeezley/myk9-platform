/**
 * The Entries toolbar (docs/plan-entries-filter-button.md): a "Show:" menu with checkable queues,
 * a quiet search, one Filter button for Trial and Class, the applied filters as sentences, and a
 * plain status sentence with a "Show all forms" button that resets view, scope and search.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  result: { shown: number; total: number } | null = { shown: 214, total: 214 },
  selectionCount = 214
) {
  const cockpit = {
    state: { ...BASE_STATE, ...overrides },
    groups: [],
    queueCounts: QUEUE_COUNTS,
    queueSelectionCount: selectionCount,
    setQueues: vi.fn(),
    setException: vi.fn(),
    setScope: vi.fn(),
    setSearch: vi.fn(),
  };
  const onClearAll = vi.fn();
  const view = render(
    <EntryManagementViewToolbar
      cockpit={cockpit}
      exceptionCounts={{ pulls: 2, moveUps: 1 }}
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

  it('is one Show: menu, a search and a Filter button, with no Trial or Class selects', () => {
    renderToolbar({ queues: ['needs-review', 'payment-due'] }, { shown: 15, total: 214 }, 15);

    // "Needs review +1 (15)" keeps the count beside the search; the name starts with the visible
    // text (WCAG 2.5.3) and the full list is the description.
    const show = screen.getByRole('button', { name: 'Show: Needs review +1 (15)' });
    expect(show).toHaveTextContent('Needs review +1 (15)');
    expect(show).toHaveAccessibleDescription('Needs review + Payment due (15)');
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Search exhibitor, dog, handler/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Trial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Class' })).not.toBeInTheDocument();
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

  it('checks a second queue without closing, and a list like Waitlist replaces the queues', async () => {
    const { user, cockpit } = renderToolbar({ queues: ['needs-review'] }, undefined, 12);

    await user.click(screen.getByRole('button', { name: 'Show: Needs review (12)' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Payment due (5)' }));
    expect(cockpit.setQueues).toHaveBeenLastCalledWith(['needs-review', 'payment-due']);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Needs review (12)' })).toBeChecked();

    await user.click(screen.getByRole('menuitemradio', { name: 'Waitlist' }));
    expect(cockpit.setException).toHaveBeenCalledWith('waitlist');
  });

  it('unchecking the only queue shows All rather than an empty list', async () => {
    const { user, cockpit } = renderToolbar({ queues: ['payment-due'] }, undefined, 5);

    await user.click(screen.getByRole('button', { name: 'Show: Payment due (5)' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Payment due (5)' }));

    expect(cockpit.setQueues).toHaveBeenLastCalledWith(['all']);
  });
});
