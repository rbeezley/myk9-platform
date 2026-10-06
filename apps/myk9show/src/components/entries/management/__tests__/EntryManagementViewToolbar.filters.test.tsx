/**
 * MYK9-906: the Entries page's filter row is a labelled "Show:" select, a
 * labelled Trial/Class select pair, and a plain status sentence with a
 * "Show all forms" button that resets view, scope and search.
 */
import { describe, expect, it, vi } from 'vitest';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import { render, screen } from '@/test/utils/testUtils';
import { EntryManagementViewToolbar } from '../EntryManagementViewToolbar';
import type { EntryManagementCockpitState } from '../entryManagementCockpitParams';

const BASE_STATE: EntryManagementCockpitState = {
  tab: 'registrations',
  exception: 'move-ups',
  queue: 'all',
  search: '',
  trialId: null,
  classId: null,
  registrationKey: null,
};

const COUNTS = {
  queueCounts: { 'needs-review': 12, 'missing-information': 3, 'payment-due': 5, all: 214 },
  pulls: 0,
  moveUps: 0,
};

function renderToolbar(
  overrides: Partial<EntryManagementCockpitState> = {},
  result: { shown: number; total: number } | null = { shown: 214, total: 214 },
  onClearAll = vi.fn()
) {
  const view = render(
    <EntryManagementViewToolbar
      state={{ ...BASE_STATE, ...overrides }}
      counts={COUNTS}
      trials={[{ id: 't1', name: 'Saturday', date: null, trial_number: 1 }]}
      trialClasses={[]}
      onSelectView={vi.fn()}
      onScopeChange={vi.fn()}
      onSearchChange={vi.fn()}
      onClearAll={onClearAll}
      result={result}
    />
  );
  return { ...view, onClearAll };
}

describe('EntryManagementViewToolbar filters', () => {
  it('on a phone or tablet it still reads "Showing all", since the one-row layout does not fit', () => {
    mockViewportWidth(768);
    renderToolbar();

    expect(screen.getByRole('status')).toHaveTextContent('Showing all 214 forms.');
  });

  it('from lg it stays quiet, with no Show all button, when nothing narrows the list', () => {
    mockViewportWidth(1440);
    renderToolbar();

    // The live region stays mounted but empty, so the first search is still announced.
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('shows the view as a labelled select and the Trial and Class selects without chips', () => {
    renderToolbar({ queue: 'needs-review' }, { shown: 12, total: 214 });

    expect(screen.getByRole('combobox', { name: 'Show: Entry views' })).toHaveTextContent(
      'Needs review (12)'
    );
    expect(screen.getByRole('combobox', { name: 'Trial' })).toHaveTextContent('All trials');
    expect(screen.getByRole('combobox', { name: 'Class' })).toHaveTextContent('All classes');
    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Payment status' })).not.toBeInTheDocument();
  });

  it('says "Showing X of Y" with a count only, and Show all resets the applied state', async () => {
    const { user, onClearAll } = renderToolbar(
      { queue: 'needs-review', trialId: 't1' },
      { shown: 3, total: 214 }
    );

    expect(screen.getByRole('status').textContent).toBe('Showing 3 of 214 forms.');
    await user.click(screen.getByRole('button', { name: 'Show all forms' }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it('counts a search as filtered too', () => {
    renderToolbar({ queue: 'all', search: 'bob' }, { shown: 4, total: 214 });
    expect(screen.getByRole('status').textContent).toBe('Showing 4 of 214 forms.');
  });

  it('shows no sentence until the entries have loaded', () => {
    renderToolbar({}, null);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
