import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupedSearchablePopover } from '@/components/ui/grouped-searchable-popover';

// Mock Popover to render inline (avoids Portal/floating-ui issues in jsdom)
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

interface Item {
  id: string;
  name: string;
}

const people: Item[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];
const judges: Item[] = [{ id: '3', name: 'Carol' }];

function renderPicker(overrides: Partial<Parameters<typeof GroupedSearchablePopover>[0]> = {}) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <GroupedSearchablePopover<Item>
      open={true}
      onOpenChange={onOpenChange}
      triggerLabel="Select person"
      searchPlaceholder="Search..."
      searchTerm=""
      onSearchChange={vi.fn()}
      groups={[
        { groupKey: 'suggested', label: 'Suggested', items: judges },
        { groupKey: 'all', label: 'All People', items: people },
      ]}
      renderItem={item => <span>{item.name}</span>}
      onSelect={onSelect}
      {...overrides}
    />
  );
  return { onSelect, onOpenChange };
}

describe('GroupedSearchablePopover', () => {
  it('renders section headers for each group', () => {
    renderPicker();
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    expect(screen.getByText('All People')).toBeInTheDocument();
  });

  it('renders items in each group', () => {
    renderPicker();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('hides empty groups', () => {
    renderPicker({
      groups: [
        { groupKey: 'suggested', label: 'Suggested', items: [] },
        { groupKey: 'all', label: 'All People', items: people },
      ],
    });
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
    expect(screen.getByText('All People')).toBeInTheDocument();
  });

  it('calls onSelect with item and groupKey when an item is clicked', () => {
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByText('Carol'));
    expect(onSelect).toHaveBeenCalledWith({ id: '3', name: 'Carol' }, 'suggested');
  });

  it('renders footer when provided', () => {
    renderPicker({ footer: <button>Add new</button> });
    expect(screen.getByText('Add new')).toBeInTheDocument();
  });

  it('shows "No results" when all groups are empty', () => {
    renderPicker({
      groups: [
        { groupKey: 'suggested', label: 'Suggested', items: [] },
        { groupKey: 'all', label: 'All People', items: [] },
      ],
    });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});
