import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { JudgesPicker } from '@/components/shows/wizard/steps/JudgesPicker';
import type { User } from '@/types/user-types';
import type { ResolvedJudge } from '@/components/shows/wizard/steps/ShowDetailsStep.types';
import { renderWithProviders } from '@/test/utils/testUtils';

// Mock GroupedSearchablePopover to avoid Portal/floating-ui issues in jsdom.
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
              <div
                key={item.id}
                onClick={() => {
                  onSelect(item, g.groupKey);
                  onOpenChange(false);
                }}
              >
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

// Mock Select component to avoid Radix Portal issues in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="select-mock" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <button type="button" data-value={value}>
      {children}
    </button>
  ),
}));

function makeUser(id: string, firstName: string, hasCredentials = false): User {
  return {
    id,
    firstName,
    lastName: 'Smith',
    email: `${firstName.toLowerCase()}@test.com`,
    roles: [],
    judgeInfo: hasCredentials
      ? {
          judgeNumber: 'AKC-1',
          qualifications: [{ judgeNumber: 'AKC-1', organization: 'AKC' } as never],
          certifications: [],
          availability: {
            startDate: null,
            endDate: null,
            blackoutDates: [],
            maxShowsPerMonth: 0,
            travelRadius: 0,
          },
        }
      : undefined,
  } as User;
}

const qualifiedJudge = makeUser('1', 'Alice', true);
const unqualified = makeUser('2', 'Bob', false);

const resolvedAlice: ResolvedJudge = { id: '1', name: 'Alice Smith', judgeNumber: 'AKC-1' };

describe('JudgesPicker', () => {
  it('renders selected judge chips', () => {
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[resolvedAlice]}
        people={[qualifiedJudge, unqualified]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('#AKC-1')).toBeInTheDocument();
  });

  it('calls onRemoveJudge when chip × is clicked', () => {
    const onRemoveJudge = vi.fn();
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[resolvedAlice]}
        people={[qualifiedJudge]}
        onAddJudge={vi.fn()}
        onRemoveJudge={onRemoveJudge}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove alice smith/i }));
    expect(onRemoveJudge).toHaveBeenCalledWith('1');
  });

  it('calls onAddJudge immediately when selecting from Qualified group', async () => {
    const onAddJudge = vi.fn();
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[qualifiedJudge, unqualified]}
        onAddJudge={onAddJudge}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onAddJudge).toHaveBeenCalledWith('1');
  });

  it('opens credentials form when selecting from All People group', async () => {
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[qualifiedJudge, unqualified]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText('Bob Smith'));
    fireEvent.click(screen.getByText('Bob Smith'));
    expect(screen.getByText(/add judge credentials.*bob smith/i)).toBeInTheDocument();
  });

  it('calls onSaveCredentials with form data when credentials form is submitted', async () => {
    const onSaveCredentials = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[qualifiedJudge, unqualified]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={onSaveCredentials}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText('Bob Smith'));
    fireEvent.click(screen.getByText('Bob Smith'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 98234'), { target: { value: 'AKC-99' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'bob@test.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & add to show/i }));
    await waitFor(() =>
      expect(onSaveCredentials).toHaveBeenCalledWith('2', {
        organization: 'AKC',
        judgeNumber: 'AKC-99',
        email: 'bob@test.com',
      })
    );
  });

  it('opens new judge form when "Add new judge" footer is clicked', async () => {
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText(/add new judge/i));
    fireEvent.click(screen.getByText(/add new judge/i));
    expect(screen.getByPlaceholderText('First name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Last name')).toBeInTheDocument();
  });

  it('calls onCreateJudge with full form data', async () => {
    const onCreateJudge = vi.fn().mockResolvedValue('new-id');
    renderWithProviders(
      <JudgesPicker
        selectedJudges={[]}
        people={[]}
        onAddJudge={vi.fn()}
        onRemoveJudge={vi.fn()}
        onSaveCredentials={vi.fn()}
        onCreateJudge={onCreateJudge}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /search and add judges/i }));
    await waitFor(() => screen.getByText(/add new judge/i));
    fireEvent.click(screen.getByText(/add new judge/i));
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Lee' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 98234'), { target: { value: 'UKC-55' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'dana@lee.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add judge/i }));
    await waitFor(() =>
      expect(onCreateJudge).toHaveBeenCalledWith({
        firstName: 'Dana',
        lastName: 'Lee',
        organization: 'AKC',
        judgeNumber: 'UKC-55',
        email: 'dana@lee.com',
      })
    );
  });
});
