import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { OfficialPicker } from '@/components/shows/wizard/steps/OfficialPicker';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { renderWithProviders } from '@/test/utils/testUtils';

// Mock GroupedSearchablePopover to avoid Portal/floating-ui issues in jsdom.
// Renders trigger button + content inline, gated on the `open` prop.
vi.mock('@/components/ui/grouped-searchable-popover', () => ({
  GroupedSearchablePopover: ({
    open,
    onOpenChange,
    triggerLabel,
    groups,
    renderItem,
    onSelect,
    footer,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    triggerLabel: string;
    groups: Array<{ groupKey: string; label: string; items: Array<{ id: string }> }>;
    renderItem: (item: unknown, groupKey: string) => React.ReactNode;
    onSelect: (item: unknown, groupKey: string) => void;
    footer?: React.ReactNode;
  }) => (
    <div>
      <button type="button" onClick={() => onOpenChange(!open)}>
        {triggerLabel}
      </button>
      {open && (
        <div>
          {groups.map(g =>
            g.items.map(item => (
              <div key={item.id} onClick={() => onSelect(item, g.groupKey)}>
                {renderItem(item, g.groupKey)}
              </div>
            ))
          )}
          {footer}
        </div>
      )}
    </div>
  ),
}));

function makeUser(id: string, firstName: string, roles: UserRole[] = []): User {
  return {
    id,
    firstName,
    lastName: 'Smith',
    email: `${firstName.toLowerCase()}@test.com`,
    roles,
  } as User;
}

const chairman = makeUser('1', 'Alice', [UserRole.CHAIRMAN]);
const exhibitor = makeUser('2', 'Bob', [UserRole.EXHIBITOR]);

describe('OfficialPicker', () => {
  it('shows selected person name when selectedPersonId is set', () => {
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId="1"
        people={[chairman, exhibitor]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={vi.fn()}
        onCreatePerson={vi.fn()}
      />
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows auto-fill badge when autoFillBadge is provided', () => {
    renderWithProviders(
      <OfficialPicker
        label="Show Secretary"
        selectedPersonId="2"
        people={[chairman, exhibitor]}
        suggestedRoles={[UserRole.SECRETARY]}
        autoFillBadge="You"
        onSelect={vi.fn()}
        onCreatePerson={vi.fn()}
      />
    );
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('calls onSelect when a person is chosen from the popover', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId={undefined}
        people={[chairman, exhibitor]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={onSelect}
        onCreatePerson={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select show chairman/i }));
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('hides secretaries outside the selected club when scoped grouping is required', async () => {
    const onSelect = vi.fn();
    const clubASecretary = {
      ...makeUser('club-a-secretary', 'Ada', [UserRole.SECRETARY]),
      roleAssignments: [{ roleName: UserRole.SECRETARY, clubId: 'club-a', isActive: true }],
    } as User;
    const clubBSecretary = {
      ...makeUser('club-b-secretary', 'Bea', [UserRole.SECRETARY]),
      roleAssignments: [{ roleName: UserRole.SECRETARY, clubId: 'club-b', isActive: true }],
    } as User;

    renderWithProviders(
      <OfficialPicker
        label="Show Secretary"
        selectedPersonId={undefined}
        people={[clubASecretary, clubBSecretary]}
        suggestedRoles={[UserRole.SECRETARY]}
        groupingOptions={{ clubId: 'club-a', requireScopedRole: true }}
        onSelect={onSelect}
        onCreatePerson={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /select show secretary/i }));

    await waitFor(() => expect(screen.getByText('Ada Smith')).toBeInTheDocument());
    expect(screen.queryByText('Bea Smith')).not.toBeInTheDocument();
  });

  it('expands create form when "Add new" is clicked', async () => {
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId={undefined}
        people={[chairman]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={vi.fn()}
        onCreatePerson={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select show chairman/i }));
    await waitFor(() => screen.getByText(/add new show chairman/i));
    fireEvent.click(screen.getByText(/add new show chairman/i));
    expect(screen.getByPlaceholderText('First name')).toBeInTheDocument();
  });

  it('calls onCreatePerson with form data when "Add" is submitted', async () => {
    const onCreatePerson = vi.fn().mockResolvedValue('new-id');
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId={undefined}
        people={[]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={vi.fn()}
        onCreatePerson={onCreatePerson}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select show chairman/i }));
    await waitFor(() => screen.getByText(/add new show chairman/i));
    fireEvent.click(screen.getByText(/add new show chairman/i));
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'jane@doe.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add show chairman/i }));
    await waitFor(() =>
      expect(onCreatePerson).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@doe.com',
      })
    );
  });

  it('disables the save button when required fields are empty', async () => {
    renderWithProviders(
      <OfficialPicker
        label="Show Chairman"
        selectedPersonId={undefined}
        people={[]}
        suggestedRoles={[UserRole.CHAIRMAN]}
        onSelect={vi.fn()}
        onCreatePerson={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select show chairman/i }));
    await waitFor(() => screen.getByText(/add new show chairman/i));
    fireEvent.click(screen.getByText(/add new show chairman/i));
    expect(screen.getByRole('button', { name: /add show chairman/i })).toBeDisabled();
  });
});
