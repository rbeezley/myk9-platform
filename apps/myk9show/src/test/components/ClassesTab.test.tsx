import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';

const mockClasses = [
  {
    id: 'c1',
    name: 'Novice Containers',
    element: 'Containers',
    level: 'Novice',
    time: '9:00 AM',
    ring: 1,
    status: 'in_progress',
    entryCount: 28,
    userHasEntry: true,
  },
  {
    id: 'c2',
    name: 'Novice Interior',
    element: 'Interior',
    level: 'Novice',
    time: '10:30 AM',
    ring: 1,
    status: 'pending',
    entryCount: 22,
    userHasEntry: true,
  },
  {
    id: 'c3',
    name: 'Advanced Exterior',
    element: 'Exterior',
    level: 'Advanced',
    time: '1:00 PM',
    ring: 2,
    status: 'pending',
    entryCount: 15,
    userHasEntry: false,
  },
];

// Mock a simple data source — the component will receive classes as props or via hook
// For simplicity, we pass classes as a prop
vi.mock('@/components/common/MineToggle', () => ({
  MineToggle: ({
    isMine,
    onToggle,
    allLabel,
    mineLabel,
  }: {
    isMine: boolean;
    onToggle: () => void;
    allLabel: string;
    mineLabel: string;
  }) => (
    <div data-testid="mine-toggle">
      <button onClick={onToggle}>{isMine ? mineLabel : allLabel}</button>
    </div>
  ),
}));

vi.mock('@/components/common/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

describe('ClassesTab', () => {
  it('renders a table with class info', () => {
    render(<ClassesTab classes={mockClasses} userHasEntries={true} />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getAllByText('Novice')).toHaveLength(2);
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
  });

  it('defaults to showing only user classes when user has entries', () => {
    render(<ClassesTab classes={mockClasses} userHasEntries={true} />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.queryByText('Exterior')).toBeNull();
  });

  it('shows all classes when toggled', () => {
    render(<ClassesTab classes={mockClasses} userHasEntries={true} />);
    // Click the toggle (which shows "My Classes" text when isMine=true, clicking switches)
    fireEvent.click(screen.getByText('My Classes'));
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });

  it('shows empty state when no classes', () => {
    render(<ClassesTab classes={[]} userHasEntries={false} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});
