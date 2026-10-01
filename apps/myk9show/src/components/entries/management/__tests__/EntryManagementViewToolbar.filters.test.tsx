/**
 * MYK9-906: the Entries page's filter row is a labelled "Show:" select, a
 * labelled Trial/Class select pair, and a plain status sentence with a
 * "Show all registrations" button that resets view, scope and search.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EntryManagementViewToolbar } from '../EntryManagementViewToolbar';
import type { EntryManagementCockpitState } from '../entryManagementCockpitParams';

const BASE_STATE: EntryManagementCockpitState = {
  tab: 'registrations',
  exception: 'move-ups',
  queue: 'all',
  search: '',
  density: 'comfortable',
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
  result = { shown: 214, total: 214 },
  onClearAll = vi.fn(),
  scopeUnavailable = false
) {
  const view = render(
    <EntryManagementViewToolbar
      state={{ ...BASE_STATE, ...overrides }}
      counts={COUNTS}
      trials={[{ id: 't1', name: 'Saturday', date: null, trial_number: 1 }]}
      trialClasses={[]}
      density="comfortable"
      onSelectView={vi.fn()}
      onScopeChange={vi.fn()}
      onSearchChange={vi.fn()}
      onDensityChange={vi.fn()}
      onClearAll={onClearAll}
      result={result}
      scopeUnavailable={scopeUnavailable}
    />
  );
  return { ...view, onClearAll };
}

describe('EntryManagementViewToolbar filters', () => {
  it('reads "Showing all" with no Show all button when nothing narrows the list', () => {
    renderToolbar();

    expect(screen.getByRole('status')).toHaveTextContent('Showing all 214 registrations.');
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

  it('states the view and the trial without a search, and resets them from "Show all"', async () => {
    const { user, onClearAll } = renderToolbar(
      { queue: 'needs-review', trialId: 't1' },
      { shown: 3, total: 214 }
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 3 of 214 registrations (Needs review, Trial: Saturday).'
    );
    await user.click(screen.getByRole('button', { name: 'Show all registrations' }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it('with a search, says it searched the whole show and omits the view and scope that it bypasses', () => {
    renderToolbar(
      { queue: 'needs-review', trialId: 't1', search: 'bob' },
      { shown: 4, total: 214 }
    );

    const text = screen.getByRole('status').textContent;
    expect(text).toBe(
      'Showing 4 of 214 registrations (matching \u201cbob\u201d across the whole show).'
    );
    expect(text).not.toMatch(/Needs review|Trial/);
  });

  it('omits the trial from the sentence when the trial scope could not be applied', () => {
    renderToolbar(
      { queue: 'needs-review', trialId: 't1' },
      { shown: 12, total: 214 },
      vi.fn(),
      true
    );

    const text = screen.getByRole('status').textContent;
    expect(text).toBe('Showing 12 of 214 registrations (Needs review).');
    expect(text).not.toContain('Saturday');
  });
});
