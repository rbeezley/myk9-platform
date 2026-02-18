import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConflictResolutionDialog } from '@/components/sync/ConflictResolutionDialog';

// Mock useAuthContext to avoid needing AuthProvider
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    hasRole: vi.fn().mockReturnValue(false),
    hasPermission: vi.fn().mockReturnValue(false),
    getUserRoles: vi.fn().mockReturnValue(['exhibitor']),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    updateProfile: vi.fn(),
    switchUserRole: vi.fn(),
    userWithRoles: null,
  }),
}));

// Mock the UI components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-description">{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-title">{children}</div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    'data-testid'?: string;
    [key: string]: unknown;
  }) => (
    <button
      onClick={onClick}
      data-variant={variant}
      data-testid={props['data-testid'] || 'button'}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    variant,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-variant={variant} className={className} data-testid="badge">
      {children}
    </span>
  ),
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr data-testid="separator" />,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

describe('ConflictResolutionDialog', () => {
  const mockConflict = {
    entityType: 'person',
    entityId: 'person-123',
    entityName: 'John Doe',
    local: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '555-0123',
    },
    remote: {
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@example.com',
      phone: '555-0123',
    },
    conflictFields: ['lastName', 'email'],
    lastModified: {
      local: new Date('2024-01-15T10:00:00Z'),
      remote: new Date('2024-01-15T11:00:00Z'),
    },
    lastModifiedBy: {
      local: 'user1',
      remote: 'user2',
    },
  };

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    conflict: mockConflict,
    onResolve: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render when open with conflict data', () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    // Title changed from 'Sync Conflict Detected' to 'Resolve Data Conflict'
    expect(screen.getByText('Resolve Data Conflict')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<ConflictResolutionDialog {...defaultProps} open={false} />);

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('should not render when conflict is null', () => {
    render(<ConflictResolutionDialog {...defaultProps} conflict={null} />);

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('should display conflict summary with timestamps', () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    expect(screen.getByText('Local Changes')).toBeInTheDocument();
    expect(screen.getByText('Server Changes')).toBeInTheDocument();
    expect(screen.getByText('By: user1')).toBeInTheDocument();
    expect(screen.getByText('By: user2')).toBeInTheDocument();
  });

  it('should display conflicting fields for resolution', () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    // Field names are rendered via `field.replace(/([A-Z])/g, ' $1').trim()` so
    // 'lastName' → 'last Name' (capitalized via CSS or text-transform, shown as-is)
    // Check field label elements exist (they use `capitalize` CSS class)
    expect(screen.getByText('last Name')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    // Field values from local and remote are rendered via formatValue
    expect(screen.getByText('Doe')).toBeInTheDocument();
    expect(screen.getByText('Smith')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('john.smith@example.com')).toBeInTheDocument();
  });

  it('should allow selecting local or remote values for each field', async () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    // With 2 conflict fields, local is 'Selected' (default) and remote shows 'Use This'.
    // So there are 2 'Use This' buttons (one per conflict field, for remote side).
    const useThisButtons = screen.getAllByText('Use This');
    expect(useThisButtons).toHaveLength(2); // 2 fields × 1 remote button each

    // Click on remote version for first field (lastName)
    fireEvent.click(useThisButtons[0]);

    await waitFor(() => {
      // After clicking remote for first field, both fields now have a 'Selected' button
      // (remote for lastName, local for email still Selected)
      expect(screen.getAllByText('Selected')).toHaveLength(2);
    });
  });

  it('should call onResolve with local when Keep All Local is clicked', () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    const keepLocalButton = screen.getByText('Keep All Local');
    fireEvent.click(keepLocalButton);

    expect(defaultProps.onResolve).toHaveBeenCalledWith('local');
  });

  it('should call onResolve with remote when Keep All Server is clicked', () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    const keepServerButton = screen.getByText('Keep All Server');
    fireEvent.click(keepServerButton);

    expect(defaultProps.onResolve).toHaveBeenCalledWith('remote');
  });

  it('should call onResolve with merge and merged data when Apply Selected Changes is clicked', async () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    // With 2 conflict fields, remote buttons are the 'Use This' buttons.
    // Clicking the second 'Use This' selects remote email.
    const useThisButtons = screen.getAllByText('Use This');
    expect(useThisButtons).toHaveLength(2); // One per field (remote side)
    fireEvent.click(useThisButtons[1]); // Remote button for email field

    const applyButton = screen.getByText('Apply Selected Changes');
    fireEvent.click(applyButton);

    expect(defaultProps.onResolve).toHaveBeenCalledWith('merge', {
      firstName: 'John',
      lastName: 'Doe', // Local value (default selection)
      email: 'john.smith@example.com', // Remote value (selected)
      phone: '555-0123',
    });
  });

  it('should call onCancel when Cancel button is clicked', () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('should format complex values correctly', () => {
    const complexConflict = {
      ...mockConflict,
      local: {
        ...mockConflict.local,
        address: { street: '123 Main St', city: 'Local City' },
        active: true,
        tags: ['tag1', 'tag2'],
      },
      remote: {
        ...mockConflict.remote,
        address: { street: '456 Oak Ave', city: 'Remote City' },
        active: false,
        tags: ['tag3', 'tag4'],
      },
      conflictFields: ['address', 'active', 'tags'],
    };

    render(<ConflictResolutionDialog {...defaultProps} conflict={complexConflict} />);

    expect(screen.getByText('Yes')).toBeInTheDocument(); // Boolean true
    expect(screen.getByText('No')).toBeInTheDocument(); // Boolean false
    expect(screen.getByText(/"street": "123 Main St"/)).toBeInTheDocument(); // JSON object
    expect(screen.getByText(/"street": "456 Oak Ave"/)).toBeInTheDocument(); // JSON object
  });

  it('should handle null and undefined values', () => {
    const nullConflict = {
      ...mockConflict,
      local: {
        ...mockConflict.local,
        optional: null,
      },
      remote: {
        ...mockConflict.remote,
        optional: 'has value',
      },
      conflictFields: ['optional'],
    };

    render(<ConflictResolutionDialog {...defaultProps} conflict={nullConflict} />);

    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText('has value')).toBeInTheDocument();
  });

  it('should initialize with local values selected by default', () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    // Should have "Selected" text for local values initially
    const selectedButtons = screen.getAllByText('Selected');
    expect(selectedButtons).toHaveLength(2); // One for each conflict field
  });

  it('should handle field selection toggle', async () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    // Initially local should be selected
    expect(screen.getAllByText('Selected')).toHaveLength(2);
    expect(screen.getAllByText('Use This')).toHaveLength(2);

    // Click on remote version for first field
    const useThisButtons = screen.getAllByText('Use This');
    fireEvent.click(useThisButtons[0]);

    await waitFor(() => {
      // Should still have 2 selected (one changed from local to remote)
      expect(screen.getAllByText('Selected')).toHaveLength(2);
      expect(screen.getAllByText('Use This')).toHaveLength(2);
    });
  });

  it('should display entity type and conflict information correctly', () => {
    render(<ConflictResolutionDialog {...defaultProps} />);

    // The dialog header shows entity type and "Multiple fields" since no fieldPath is provided
    // 'person' entity type is shown in DialogDescription
    expect(screen.getByText(/person conflict detected/)).toBeInTheDocument();
    expect(screen.getByText(/Multiple fields/)).toBeInTheDocument();
  });
});
