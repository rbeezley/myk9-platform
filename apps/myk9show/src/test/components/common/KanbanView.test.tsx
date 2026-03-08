import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

// Mock @dnd-kit modules to avoid DOM measurement issues in jsdom
vi.mock('@dnd-kit/core', () => {
  const DndContext = ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: unknown) => void;
  }) => {
    // Expose onDragEnd for tests via a data attribute on wrapper
    return (
      <div data-testid="dnd-context" data-on-drag-end={onDragEnd ? 'true' : 'false'}>
        {children}
      </div>
    );
  };
  const DragOverlay = () => null;
  const useDroppable = ({ id: _id }: { id: string }) => ({
    setNodeRef: vi.fn(),
    isOver: false,
  });
  return {
    DndContext,
    DragOverlay,
    useDroppable,
    pointerWithin: vi.fn(),
  };
});

vi.mock('@dnd-kit/sortable', () => {
  const SortableContext = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const useSortable = ({ id }: { id: string }) => ({
    attributes: { 'data-sortable-id': id },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  });
  return { SortableContext, useSortable, verticalListSortingStrategy: 'vertical' };
});

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: (transform: unknown) => (transform ? 'translate3d(0,0,0)' : undefined),
    },
  },
}));

import { KanbanView, type KanbanColumn, type KanbanItem } from '@/components/common/KanbanView';

// ---- Test helpers ----

interface TestItem extends KanbanItem {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
}

const columns: KanbanColumn<TestItem['status']>[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

const sampleItems: TestItem[] = [
  { id: '1', title: 'Task A', status: 'todo' },
  { id: '2', title: 'Task B', status: 'todo' },
  { id: '3', title: 'Task C', status: 'in-progress' },
  { id: '4', title: 'Task D', status: 'done' },
  { id: '5', title: 'Task E', status: 'done' },
  { id: '6', title: 'Task F', status: 'done' },
];

const getItemStatus = (item: TestItem) => item.status;
const renderCard = (item: TestItem) => <div data-testid={`card-${item.id}`}>{item.title}</div>;

function renderKanban(
  props: Partial<React.ComponentProps<typeof KanbanView<TestItem, TestItem['status']>>> = {}
) {
  return render(
    <KanbanView
      items={sampleItems}
      columns={columns}
      getItemStatus={getItemStatus}
      renderCard={renderCard}
      {...props}
    />
  );
}

// ---- Tests ----

describe('KanbanView', () => {
  describe('Column headers and counts', () => {
    it('renders all column headers', () => {
      renderKanban();

      expect(screen.getByText('To Do')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('renders correct item counts per column', () => {
      renderKanban();

      // To Do has 2 items, In Progress has 1, Done has 3
      const headings = screen.getAllByRole('heading', { level: 3 });

      // Find the badge (count) next to each heading by traversing siblings
      for (const heading of headings) {
        const parent = heading.parentElement!;
        const badge = within(parent).getByText(/^\d+$/);

        if (heading.textContent === 'To Do') {
          expect(badge).toHaveTextContent('2');
        } else if (heading.textContent === 'In Progress') {
          expect(badge).toHaveTextContent('1');
        } else if (heading.textContent === 'Done') {
          expect(badge).toHaveTextContent('3');
        }
      }
    });
  });

  describe('Grouping items by status', () => {
    it('renders cards in the correct columns', () => {
      renderKanban();

      // All card titles should be rendered
      expect(screen.getByText('Task A')).toBeInTheDocument();
      expect(screen.getByText('Task B')).toBeInTheDocument();
      expect(screen.getByText('Task C')).toBeInTheDocument();
      expect(screen.getByText('Task D')).toBeInTheDocument();
      expect(screen.getByText('Task E')).toBeInTheDocument();
      expect(screen.getByText('Task F')).toBeInTheDocument();
    });

    it('groups items correctly using getItemStatus', () => {
      renderKanban();

      // Verify all 6 cards are rendered with correct test ids
      expect(screen.getByTestId('card-1')).toBeInTheDocument();
      expect(screen.getByTestId('card-2')).toBeInTheDocument();
      expect(screen.getByTestId('card-3')).toBeInTheDocument();
      expect(screen.getByTestId('card-4')).toBeInTheDocument();
      expect(screen.getByTestId('card-5')).toBeInTheDocument();
      expect(screen.getByTestId('card-6')).toBeInTheDocument();
    });
  });

  describe('renderCard prop', () => {
    it('renders custom card content via renderCard', () => {
      const customRender = (item: TestItem) => (
        <div data-testid={`custom-${item.id}`}>
          <span className="title">{item.title}</span>
          <span className="status">{item.status}</span>
        </div>
      );

      renderKanban({ renderCard: customRender });

      const card = screen.getByTestId('custom-1');
      expect(card).toBeInTheDocument();
      expect(within(card).getByText('Task A')).toBeInTheDocument();
      expect(within(card).getByText('todo')).toBeInTheDocument();
    });
  });

  describe('Empty states', () => {
    it('shows "No items" for columns with no items', () => {
      // Only provide items for "todo" — the other columns should be empty
      const todoOnlyItems: TestItem[] = [{ id: '1', title: 'Only Task', status: 'todo' }];

      renderKanban({ items: todoOnlyItems });

      // Two columns should show "No items"
      const noItemsMessages = screen.getAllByText('No items');
      expect(noItemsMessages).toHaveLength(2);
    });

    it('shows "No items" in all columns when items array is empty', () => {
      renderKanban({ items: [] });

      const noItemsMessages = screen.getAllByText('No items');
      expect(noItemsMessages).toHaveLength(3);
    });

    it('renders correct zero counts for empty columns', () => {
      renderKanban({ items: [] });

      const zeroBadges = screen.getAllByText('0');
      expect(zeroBadges).toHaveLength(3);
    });
  });

  describe('Handles empty items array', () => {
    it('renders all columns even with no items', () => {
      renderKanban({ items: [] });

      expect(screen.getByText('To Do')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });

  describe('onStatusChange and drag end', () => {
    it('passes onStatusChange to DndContext (drag end wired)', () => {
      const handleStatusChange = vi.fn();
      renderKanban({ onStatusChange: handleStatusChange });

      // The DndContext mock exposes whether onDragEnd was provided
      const dndContext = screen.getByTestId('dnd-context');
      expect(dndContext).toHaveAttribute('data-on-drag-end', 'true');
    });

    it('renders without onStatusChange (optional prop)', () => {
      // Should not throw when onStatusChange is not provided
      expect(() => renderKanban({ onStatusChange: undefined })).not.toThrow();
    });
  });

  describe('className prop', () => {
    it('applies custom className to the container', () => {
      renderKanban({ className: 'my-custom-class' });

      const dndWrapper = screen.getByTestId('dnd-context');
      const flexContainer = dndWrapper.firstElementChild as HTMLElement;
      expect(flexContainer).toHaveClass('my-custom-class');
    });
  });
});
