import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { DEFAULT_PEOPLE_FILTERS } from '@/hooks/useBrowsePeopleData';
import { UserRole, type User } from '@/types/user-types';
import { PeopleListToolbar } from '../PeopleListToolbar';

function person(overrides: Partial<User>): User {
  return { id: overrides.id ?? 'p', firstName: 'A', lastName: 'B', ...overrides } as User;
}

const PEOPLE: User[] = [
  person({
    id: 'p-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: [UserRole.JUDGE],
  }),
  person({
    id: 'p-2',
    firstName: 'Grace',
    lastName: 'Hopper',
    roles: [UserRole.EXHIBITOR],
  }),
];

function renderToolbar(overrides: Partial<Parameters<typeof PeopleListToolbar>[0]> = {}) {
  const onFiltersChange = vi.fn();
  const onClearAll = vi.fn();
  render(
    <PeopleListToolbar
      people={PEOPLE}
      matchCount={PEOPLE.length}
      filters={DEFAULT_PEOPLE_FILTERS}
      onFiltersChange={onFiltersChange}
      onClearAll={onClearAll}
      hasActiveFilters={false}
      {...overrides}
    />
  );
  return { onFiltersChange, onClearAll };
}

describe('PeopleListToolbar', () => {
  it('renders the built-in views as a Show select with counts', async () => {
    renderToolbar();
    const select = screen.getByRole('combobox', { name: 'Show: People views' });
    expect(select).toHaveTextContent('All (2)');
    await userEvent.click(select);
    expect(await screen.findByRole('option', { name: 'Judges (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /No login/ })).toBeInTheDocument();
  });

  it('selecting a view patches role/login but preserves search', async () => {
    const { onFiltersChange } = renderToolbar({
      filters: { ...DEFAULT_PEOPLE_FILTERS, search: 'ada' },
    });
    await userEvent.click(screen.getByRole('combobox', { name: 'Show: People views' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Judges (1)' }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...DEFAULT_PEOPLE_FILTERS,
      search: 'ada',
      role: 'judge',
    });
  });

  it('typing in the search field reports the raw value', async () => {
    const { onFiltersChange } = renderToolbar();
    await userEvent.type(screen.getByPlaceholderText('Search people by name or email...'), 'x');
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...DEFAULT_PEOPLE_FILTERS, search: 'x' });
  });

  it('names a role/login combination that matches no view, so Show all explains it', () => {
    renderToolbar({
      matchCount: 0,
      hasActiveFilters: true,
      filters: { ...DEFAULT_PEOPLE_FILTERS, role: 'judge', login: 'none' },
    });
    expect(screen.getByRole('combobox', { name: 'Show: People views' })).toHaveTextContent(
      'Custom'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 0 of 2 people (Role: judge, No login).'
    );
  });

  it('has no Role or Location filter field (cut by MYK9-906; the role views cover Role)', () => {
    renderToolbar();
    expect(screen.queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Location' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
  });

  it('states the active view and search in a sentence and "Show all people" clears them', async () => {
    const { onClearAll } = renderToolbar({
      matchCount: 1,
      hasActiveFilters: true,
      filters: { ...DEFAULT_PEOPLE_FILTERS, role: 'judge', search: 'ada' },
      resultLineExtra: <button type="button">Cards view</button>,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 1 of 2 people (Judges, matching \u201cada\u201d).'
    );
    expect(screen.getByRole('button', { name: 'Cards view' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all people' }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});
