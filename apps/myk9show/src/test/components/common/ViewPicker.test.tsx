import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SavedView, ViewConfig } from '@/hooks/useSavedViews';

// ---------------------------------------------------------------------------
// Mocks — Replace portal-based Base UI primitives with simple HTML so we can
// test ViewPicker logic without dealing with portals / animation layers.
// ---------------------------------------------------------------------------

// Mock dropdown-menu: render children directly, items as buttons
vi.mock('@/components/ui/dropdown-menu', () => {
  const DropdownMenu = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  );
  const DropdownMenuTrigger = ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    if (asChild && React.isValidElement(children)) return <>{children}</>;
    return <button>{children}</button>;
  };
  const DropdownMenuContent = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  );
  const DropdownMenuItem = ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <div role="menuitem" onClick={onClick} className={className}>
      {children}
    </div>
  );
  const DropdownMenuSeparator = () => <hr />;
  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  };
});

// Mock dialog: always render children when open
vi.mock('@/components/ui/dialog', () => {
  const Dialog = ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  }) => {
    // Store onOpenChange so nested components can call it
    return (
      <DialogCtxProvider value={{ open: !!open, onOpenChange }}>
        {open ? <div data-testid="dialog">{children}</div> : null}
      </DialogCtxProvider>
    );
  };

  // Tiny context so DialogContent can close the dialog
  const DialogCtx = React.createContext<{
    open: boolean;
    onOpenChange?: (v: boolean) => void;
  }>({ open: false });
  const DialogCtxProvider = DialogCtx.Provider;

  const DialogContent = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  );
  const DialogHeader = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const DialogTitle = ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>;
  const DialogFooter = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  );

  return { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter };
});

// Mock lucide icons as simple spans with aria-hidden (matches how icons typically render)
vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Comp = ({ className }: { className?: string }) => (
      <span data-testid={`icon-${name}`} className={className} />
    );
    Comp.displayName = name;
    return Comp;
  };
  return {
    Bookmark: icon('Bookmark'),
    ChevronDown: icon('ChevronDown'),
    Plus: icon('Plus'),
    Star: icon('Star'),
    Trash2: icon('Trash2'),
    Save: icon('Save'),
  };
});

import { ViewPicker } from '@/components/common/ViewPicker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeView(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: 'v1',
    name: 'My View',
    config: { filters: {} },
    isDefault: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultConfig: ViewConfig = { filters: { status: 'active' } };

function defaultProps(overrides: Partial<React.ComponentProps<typeof ViewPicker>> = {}) {
  return {
    views: [] as SavedView[],
    activeViewId: null,
    getCurrentConfig: vi.fn(() => defaultConfig),
    onApply: vi.fn(),
    onSave: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onSetDefault: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ViewPicker', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  describe('Trigger label', () => {
    it('shows "Views" when no active view', () => {
      render(<ViewPicker {...defaultProps()} />);
      expect(screen.getByText('Views')).toBeInTheDocument();
    });

    it('shows the active view name when one is selected', () => {
      const view = makeView({ id: 'v1', name: 'Upcoming Shows' });
      render(<ViewPicker {...defaultProps({ views: [view], activeViewId: 'v1' })} />);
      // The trigger span (hidden sm:inline) should show view name instead of "Views"
      const triggerLabel = screen
        .getAllByText('Upcoming Shows')
        .find(el => el.classList.contains('sm:inline'));
      expect(triggerLabel).toBeInTheDocument();
      expect(screen.queryByText('Views')).not.toBeInTheDocument();
    });
  });

  describe('View list', () => {
    it('shows "No saved views yet" when views array is empty', () => {
      render(<ViewPicker {...defaultProps()} />);
      expect(screen.getByText('No saved views yet')).toBeInTheDocument();
    });

    it('renders each view in the dropdown', () => {
      const views = [makeView({ id: 'v1', name: 'Alpha' }), makeView({ id: 'v2', name: 'Beta' })];
      render(<ViewPicker {...defaultProps({ views })} />);
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('highlights the active view with primary styling', () => {
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, activeViewId: 'v1' })} />);
      const content = screen.getByTestId('dropdown-content');
      // Find the menuitem that has the active highlight class
      const items = within(content).getAllByRole('menuitem');
      const activeItem = items.find(el => el.classList.contains('bg-primary/10'));
      expect(activeItem).toBeTruthy();
      expect(activeItem!.textContent).toContain('Alpha');
    });
  });

  describe('Applying a view', () => {
    it('calls onApply with the view id when a view is clicked', async () => {
      const onApply = vi.fn();
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, onApply })} />);

      await user.click(screen.getByText('Alpha'));
      expect(onApply).toHaveBeenCalledWith('v1');
    });
  });

  describe('Save dialog', () => {
    it('opens when "Save current view" is clicked', async () => {
      render(<ViewPicker {...defaultProps()} />);

      // Dialog should not be visible initially
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

      await user.click(screen.getByText('Save current view'));
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByText('Save View')).toBeInTheDocument();
    });

    it('has a disabled Save button when name is empty', async () => {
      render(<ViewPicker {...defaultProps()} />);
      await user.click(screen.getByText('Save current view'));

      const footer = screen.getByTestId('dialog-footer');
      const saveBtn = within(footer).getByRole('button', { name: 'Save' });
      expect(saveBtn).toBeDisabled();
    });

    it('enables Save button when name has content', async () => {
      render(<ViewPicker {...defaultProps()} />);
      await user.click(screen.getByText('Save current view'));

      const input = screen.getByPlaceholderText(/view name/i);
      await user.type(input, 'New View');

      const footer = screen.getByTestId('dialog-footer');
      const saveBtn = within(footer).getByRole('button', { name: 'Save' });
      expect(saveBtn).not.toBeDisabled();
    });

    it('calls onSave with name and config, then closes dialog', async () => {
      const onSave = vi.fn();
      const getCurrentConfig = vi.fn(() => defaultConfig);
      render(<ViewPicker {...defaultProps({ onSave, getCurrentConfig })} />);

      await user.click(screen.getByText('Save current view'));
      const input = screen.getByPlaceholderText(/view name/i);
      await user.type(input, 'My Custom View');

      const footer = screen.getByTestId('dialog-footer');
      await user.click(within(footer).getByRole('button', { name: 'Save' }));

      expect(onSave).toHaveBeenCalledWith('My Custom View', defaultConfig);
      expect(getCurrentConfig).toHaveBeenCalled();
      // Dialog should close after saving
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('closes when Cancel is clicked', async () => {
      render(<ViewPicker {...defaultProps()} />);
      await user.click(screen.getByText('Save current view'));
      expect(screen.getByTestId('dialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Delete handler', () => {
    it('calls onDelete when delete button is clicked', async () => {
      const onDelete = vi.fn();
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, onDelete })} />);

      const deleteBtn = screen.getByLabelText('Delete Alpha');
      await user.click(deleteBtn);
      expect(onDelete).toHaveBeenCalledWith('v1');
    });

    it('does not trigger onApply when delete is clicked (stopPropagation)', async () => {
      const onApply = vi.fn();
      const onDelete = vi.fn();
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, onApply, onDelete })} />);

      await user.click(screen.getByLabelText('Delete Alpha'));
      expect(onDelete).toHaveBeenCalledWith('v1');
      expect(onApply).not.toHaveBeenCalled();
    });
  });

  describe('Star / set default handler', () => {
    it('calls onSetDefault when star button is clicked', async () => {
      const onSetDefault = vi.fn();
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, onSetDefault })} />);

      const starBtn = screen.getByLabelText('Set Alpha as default');
      await user.click(starBtn);
      expect(onSetDefault).toHaveBeenCalledWith('v1');
    });

    it('does not trigger onApply when star is clicked (stopPropagation)', async () => {
      const onApply = vi.fn();
      const onSetDefault = vi.fn();
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, onApply, onSetDefault })} />);

      await user.click(screen.getByLabelText('Set Alpha as default'));
      expect(onSetDefault).toHaveBeenCalledWith('v1');
      expect(onApply).not.toHaveBeenCalled();
    });

    it('renders a filled star icon for default views', () => {
      const views = [makeView({ id: 'v1', name: 'Alpha', isDefault: true })];
      render(<ViewPicker {...defaultProps({ views })} />);

      // The default star (inside the item) should have the fill class
      const starBtn = screen.getByLabelText('Set Alpha as default');
      const starIcon = starBtn.querySelector('[data-testid="icon-Star"]');
      expect(starIcon).toHaveClass('fill-yellow-500');
    });
  });

  describe('Update current view', () => {
    it('shows "Update" option when a view is active', () => {
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, activeViewId: 'v1' })} />);
      const content = screen.getByTestId('dropdown-content');
      // The update item renders: Update \u201cAlpha\u201d (smart quotes via &ldquo;/&rdquo;)
      const updateItem = within(content).getByText(
        (_, el) =>
          el?.getAttribute('role') === 'menuitem' && el?.textContent?.includes('Update') === true
      );
      expect(updateItem).toBeInTheDocument();
    });

    it('calls onUpdate with activeViewId and current config', async () => {
      const onUpdate = vi.fn();
      const getCurrentConfig = vi.fn(() => defaultConfig);
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(
        <ViewPicker {...defaultProps({ views, activeViewId: 'v1', onUpdate, getCurrentConfig })} />
      );

      const content = screen.getByTestId('dropdown-content');
      const updateItem = within(content).getByText(
        (_, el) =>
          el?.getAttribute('role') === 'menuitem' && el?.textContent?.includes('Update') === true
      );
      await user.click(updateItem);
      expect(onUpdate).toHaveBeenCalledWith('v1', defaultConfig);
    });

    it('does not show update option when no view is active', () => {
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, activeViewId: null })} />);
      const content = screen.getByTestId('dropdown-content');
      const updateItems = within(content).queryAllByText(
        (_, el) =>
          el?.getAttribute('role') === 'menuitem' && el?.textContent?.includes('Update') === true
      );
      expect(updateItems).toHaveLength(0);
    });
  });

  describe('Clear active view', () => {
    it('shows "Clear active view" when a view is active', () => {
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, activeViewId: 'v1' })} />);
      expect(screen.getByText('Clear active view')).toBeInTheDocument();
    });

    it('calls onClear when clicked', async () => {
      const onClear = vi.fn();
      const views = [makeView({ id: 'v1', name: 'Alpha' })];
      render(<ViewPicker {...defaultProps({ views, activeViewId: 'v1', onClear })} />);

      await user.click(screen.getByText('Clear active view'));
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('does not show "Clear active view" when no view is active', () => {
      render(<ViewPicker {...defaultProps()} />);
      expect(screen.queryByText('Clear active view')).not.toBeInTheDocument();
    });
  });
});
