import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils/testUtils';
import { DEFAULT_PEOPLE_FILTERS, type PeopleFilters } from '@/hooks/useBrowsePeopleData';
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
    state: 'CA',
  }),
  person({
    id: 'p-2',
    firstName: 'Grace',
    lastName: 'Hopper',
    roles: [UserRole.EXHIBITOR],
    state: 'NY',
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
      availableRoles={['exhibitor', 'judge']}
      availableLocations={['CA', 'NY']}
      {...overrides}
    />
  );
  return { onFiltersChange, onClearAll };
}

describe('PeopleListToolbar', () => {
  it('renders the built-in views with counts', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: /All/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Judges/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /No login/ })).toBeInTheDocument();
  });

  it('selecting a view patches role/location/login but preserves search', async () => {
    const { onFiltersChange } = renderToolbar({
      filters: { ...DEFAULT_PEOPLE_FILTERS, search: 'ada' },
    });
    await userEvent.click(screen.getByRole('button', { name: /Judges/ }));
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

  it('opens the Role filter and picks a value', async () => {
    const { onFiltersChange } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: /Filter/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Role' }));
    const roleGroup = screen.getByRole('group', { name: 'Role' });
    await userEvent.click(within(roleGroup).getByRole('button', { name: /Judge/ }));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'judge' } as Partial<PeopleFilters>)
    );
  });

  it('shows a removable chip for an active filter', async () => {
    const { onFiltersChange } = renderToolbar({
      filters: { ...DEFAULT_PEOPLE_FILTERS, location: 'CA' },
    });
    expect(screen.getByText('Location:')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Remove location filter/i }));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'all' } as Partial<PeopleFilters>)
    );
  });

  it('renders the result line and the passed extra control', () => {
    renderToolbar({
      matchCount: 1,
      hasActiveFilters: true,
      resultLineExtra: <button type="button">Cards view</button>,
    });
    expect(screen.getByRole('status')).toHaveTextContent('1 person match, of 2');
    expect(screen.getByRole('button', { name: 'Cards view' })).toBeInTheDocument();
  });
});
