/**
 * F7 — the judge and chairman pickers rendered their rows as bare <div>s with no
 * list semantics. #1845 (2026-08-28, the same day as the walk) added
 * role="listbox" / role="option", tabIndex and Enter/Space activation, so most of
 * the finding was resolved independently.
 *
 * What it did not add is aria-selected. An ARIA listbox option carries its chosen
 * state there, so without it a screen reader can enumerate the choices but cannot
 * say which one is currently in effect.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupedSearchablePopover } from '@/components/ui/grouped-searchable-popover';

type Person = { id: string; name: string };

const GROUPS = [
  {
    groupKey: 'all',
    label: 'All People',
    items: [
      { id: 'p1', name: 'Ada Lovelace' },
      { id: 'p2', name: 'Grace Hopper' },
    ] as Person[],
  },
];

function renderPopover(props: Record<string, unknown> = {}) {
  return render(
    <GroupedSearchablePopover<Person>
      open
      onOpenChange={vi.fn()}
      triggerLabel="Select a person"
      searchPlaceholder="Search…"
      searchTerm=""
      onSearchChange={vi.fn()}
      groups={GROUPS}
      renderItem={person => <span>{person.name}</span>}
      onSelect={vi.fn()}
      {...props}
    />
  );
}

describe('GroupedSearchablePopover selection state', () => {
  it('marks the selected option and leaves the others unselected', () => {
    renderPopover({ selectedItemIds: ['p2'] });

    expect(screen.getByRole('option', { name: 'Grace Hopper' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('option', { name: 'Ada Lovelace' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('supports a multi-select picker (judges)', () => {
    renderPopover({ selectedItemIds: ['p1', 'p2'] });

    for (const name of ['Ada Lovelace', 'Grace Hopper']) {
      expect(screen.getByRole('option', { name })).toHaveAttribute('aria-selected', 'true');
    }
  });

  it('omits aria-selected entirely when the caller tracks no selection', () => {
    // Better silent than asserting "not selected" for a picker that has no
    // persistent selection to report.
    renderPopover();

    expect(screen.getByRole('option', { name: 'Ada Lovelace' })).not.toHaveAttribute(
      'aria-selected'
    );
  });

  it('still exposes the rows as a listbox of options (regression guard for #1845)', () => {
    renderPopover({ selectedItemIds: [] });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});
