import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { EntitySectionConfig, DeletedEntity } from '../types';

// --- Mocks ---
/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open, onOpenChange }: any) => (
    <div
      data-testid="collapsible"
      data-open={open}
      onClick={(e: any) => {
        if (e.target.closest('[data-testid="collapsible-trigger"]')) {
          onOpenChange?.(!open);
        }
      }}
    >
      {children}
    </div>
  ),
  CollapsibleTrigger: ({ children }: any) => (
    <div data-testid="collapsible-trigger">{children}</div>
  ),
  CollapsibleContent: ({ children }: any) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  ChevronRight: ({ className }: any) => <span className={className}>chevron</span>,
  RefreshCw: ({ className }: any) => <span className={className}>refresh</span>,
  RotateCcw: ({ className }: any) => <span className={className}>rotate</span>,
  Trash2: ({ className }: any) => <span className={className}>trash</span>,
}));

/* eslint-enable @typescript-eslint/no-explicit-any */

const { DeletedEntitySection } = await import('../DeletedEntitySection');

// --- Test Helpers ---

const mockItems: DeletedEntity[] = [
  {
    id: '1',
    name: 'Test Show',
    context: 'Club: ABC',
    deleted_at: new Date().toISOString(),
    deleted_by_email: 'admin@test.com',
  },
  {
    id: '2',
    name: 'Another Show',
    deleted_at: new Date(Date.now() - 86400000).toISOString(),
    deleted_by_email: null,
  },
];

function createMockConfig(overrides?: Partial<EntitySectionConfig>): EntitySectionConfig {
  return {
    type: 'show',
    label: 'Shows',
    icon: ({ className }: { className?: string }) => (
      <span data-testid="mock-icon" className={className}>
        icon
      </span>
    ),
    iconColor: 'text-purple-600',
    fetchDeleted: vi.fn().mockResolvedValue(mockItems),
    restore: vi.fn().mockResolvedValue(undefined),
    hardDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// --- Tests ---

describe('DeletedEntitySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when count is 0', () => {
    const config = createMockConfig();
    const { container } = render(
      <DeletedEntitySection
        config={config}
        count={0}
        isActionLoading={false}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders header with label and count badge', () => {
    const config = createMockConfig();
    render(
      <DeletedEntitySection
        config={config}
        count={3}
        isActionLoading={false}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Shows')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('3');
  });

  it('calls fetchDeleted on first expand', async () => {
    const config = createMockConfig();
    render(
      <DeletedEntitySection
        config={config}
        count={2}
        isActionLoading={false}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const triggerButton = screen.getByRole('button', { name: /shows/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(config.fetchDeleted).toHaveBeenCalledTimes(1);
    });
  });

  it('renders items after fetch', async () => {
    const config = createMockConfig();
    render(
      <DeletedEntitySection
        config={config}
        count={2}
        isActionLoading={false}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const triggerButton = screen.getByRole('button', { name: /shows/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByText('Test Show')).toBeInTheDocument();
      expect(screen.getByText('Another Show')).toBeInTheDocument();
    });
  });

  it('shows context when present', async () => {
    const config = createMockConfig();
    render(
      <DeletedEntitySection
        config={config}
        count={2}
        isActionLoading={false}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const triggerButton = screen.getByRole('button', { name: /shows/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByText('Club: ABC')).toBeInTheDocument();
    });
  });

  it('shows deletion metadata', async () => {
    const config = createMockConfig();
    render(
      <DeletedEntitySection
        config={config}
        count={2}
        isActionLoading={false}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const triggerButton = screen.getByRole('button', { name: /shows/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    });
  });

  it('calls onRestore with correct args', async () => {
    const config = createMockConfig();
    const onRestore = vi.fn();
    render(
      <DeletedEntitySection
        config={config}
        count={2}
        isActionLoading={false}
        onRestore={onRestore}
        onDelete={vi.fn()}
      />
    );

    const triggerButton = screen.getByRole('button', { name: /shows/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByText('Test Show')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /restore/i });
    fireEvent.click(restoreButtons[0]!);

    expect(onRestore).toHaveBeenCalledWith('1', 'Test Show', 'show');
  });

  it('calls onDelete with correct args', async () => {
    const config = createMockConfig();
    const onDelete = vi.fn();
    render(
      <DeletedEntitySection
        config={config}
        count={2}
        isActionLoading={false}
        onRestore={vi.fn()}
        onDelete={onDelete}
      />
    );

    const triggerButton = screen.getByRole('button', { name: /shows/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByText('Test Show')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]!);

    expect(onDelete).toHaveBeenCalledWith('1', 'Test Show', 'show');
  });

  it('disables buttons when isActionLoading', async () => {
    const config = createMockConfig();
    render(
      <DeletedEntitySection
        config={config}
        count={2}
        isActionLoading={true}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const triggerButton = screen.getByRole('button', { name: /shows/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByText('Test Show')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /restore/i });
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });

    for (const btn of restoreButtons) {
      expect(btn).toBeDisabled();
    }
    for (const btn of deleteButtons) {
      expect(btn).toBeDisabled();
    }
  });
});
