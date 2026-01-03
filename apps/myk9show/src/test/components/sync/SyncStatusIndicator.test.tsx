import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';

// Mock the UI components
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-variant={variant} className={className} data-testid="badge">
      {children}
    </span>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, size, ...props }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    'data-testid'?: string;
    [key: string]: unknown;
  }) => (
    <button 
      onClick={onClick} 
      data-variant={variant}
      data-size={size}
      data-testid={props['data-testid'] || 'button'}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-provider">{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip">{children}</div>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => asChild ? children : <div data-testid="tooltip-trigger">{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-content">{children}</div>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <div data-testid="dropdown-item" onClick={onClick}>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr data-testid="dropdown-separator" />,
  DropdownMenuTrigger: ({ children, asChild }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => asChild ? children : <div data-testid="dropdown-trigger">{children}</div>,
}));

describe('SyncStatusIndicator', () => {
  const defaultProps = {
    status: 'synced' as const,
    entityType: 'person',
    entityName: 'John Doe',
    onRetrySync: vi.fn(),
    onViewHistory: vi.fn(),
    onResolveConflict: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true
    });
  });

  describe('Badge Variant', () => {
    it('should render badge variant by default', () => {
      render(<SyncStatusIndicator {...defaultProps} />);
      
      expect(screen.getByTestId('badge')).toBeInTheDocument();
      expect(screen.getByText('Synced')).toBeInTheDocument();
    });

    it('should show correct status for synced', () => {
      render(<SyncStatusIndicator {...defaultProps} status="synced" />);
      
      expect(screen.getByText('Synced')).toBeInTheDocument();
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-success-green');
    });

    it('should show correct status for pending', () => {
      render(<SyncStatusIndicator {...defaultProps} status="pending" />);
      
      expect(screen.getByText('Pending')).toBeInTheDocument();
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-warning-orange');
    });

    it('should show correct status for error', () => {
      render(<SyncStatusIndicator {...defaultProps} status="error" />);
      
      expect(screen.getByText('Error')).toBeInTheDocument();
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-error-red');
    });

    it('should show correct status for conflict', () => {
      render(<SyncStatusIndicator {...defaultProps} status="conflict" />);
      
      expect(screen.getByText('Conflict')).toBeInTheDocument();
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-warning-orange');
    });

    it('should show pending changes count when provided', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          status="pending" 
          pendingChanges={3} 
        />
      );
      
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('(3)')).toBeInTheDocument();
    });

    it('should show tooltip on hover with additional information', () => {
      const lastSyncTime = new Date('2024-01-15T10:00:00Z');
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          lastSyncTime={lastSyncTime}
          errorMessage="Network error"
        />
      );
      
      expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
    });
  });

  describe('Compact Variant', () => {
    it('should render compact variant', () => {
      render(<SyncStatusIndicator {...defaultProps} variant="compact" />);
      
      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
    });

    it('should show dropdown menu when actions available', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="compact" 
          status="error"
        />
      );
      
      expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
    });

    it('should show offline indicator when not online', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true
      });
      
      render(<SyncStatusIndicator {...defaultProps} variant="compact" />);
      
      // Should show offline icon (WifiOff)
      expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
    });
  });

  describe('Detailed Variant', () => {
    it('should render detailed variant', () => {
      render(<SyncStatusIndicator {...defaultProps} variant="detailed" />);
      
      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByText('All changes have been synchronized')).toBeInTheDocument();
    });

    it('should show last sync time when provided', () => {
      const lastSyncTime = new Date('2024-01-15T10:00:00Z');
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          lastSyncTime={lastSyncTime}
        />
      );
      
      expect(screen.getByText(/Last synchronized:/)).toBeInTheDocument();
    });

    it('should show error message when provided', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          status="error"
          errorMessage="Network timeout occurred"
        />
      );
      
      expect(screen.getByText('Network timeout occurred')).toBeInTheDocument();
    });

    it('should show offline message for pending status when offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true
      });
      
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          status="pending"
        />
      );
      
      expect(screen.getByText(/Currently offline. Changes will sync when connection is restored./)).toBeInTheDocument();
    });
  });

  describe('Action Handlers', () => {
    it('should call onRetrySync when retry button clicked', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="compact"
          status="error"
        />
      );
      
      const retryItem = screen.getByText('Retry Sync');
      fireEvent.click(retryItem);
      
      expect(defaultProps.onRetrySync).toHaveBeenCalled();
    });

    it('should call onResolveConflict when resolve button clicked', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="compact"
          status="conflict"
        />
      );
      
      const resolveItem = screen.getByText('Resolve Conflict');
      fireEvent.click(resolveItem);
      
      expect(defaultProps.onResolveConflict).toHaveBeenCalled();
    });

    it('should call onViewHistory when view history clicked', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="compact"
        />
      );
      
      const historyItem = screen.getByText('View History');
      fireEvent.click(historyItem);
      
      expect(defaultProps.onViewHistory).toHaveBeenCalled();
    });

    it('should show retry action only for error status', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="compact"
          status="synced"
        />
      );
      
      expect(screen.queryByText('Retry Sync')).not.toBeInTheDocument();
    });

    it('should show resolve conflict action only for conflict status', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="compact"
          status="synced"
        />
      );
      
      expect(screen.queryByText('Resolve Conflict')).not.toBeInTheDocument();
    });
  });

  describe('Time Formatting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should format recent time as "Just now"', () => {
      const recentTime = new Date('2024-01-15T11:59:30Z'); // 30 seconds ago
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          lastSyncTime={recentTime}
        />
      );
      
      expect(screen.getByText(/Just now/)).toBeInTheDocument();
    });

    it('should format minutes ago correctly', () => {
      const minutesAgo = new Date('2024-01-15T11:55:00Z'); // 5 minutes ago
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          lastSyncTime={minutesAgo}
        />
      );
      
      expect(screen.getByText(/5m ago/)).toBeInTheDocument();
    });

    it('should format hours ago correctly', () => {
      const hoursAgo = new Date('2024-01-15T10:00:00Z'); // 2 hours ago
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          lastSyncTime={hoursAgo}
        />
      );
      
      expect(screen.getByText(/2h ago/)).toBeInTheDocument();
    });

    it('should format days ago correctly', () => {
      const daysAgo = new Date('2024-01-13T12:00:00Z'); // 2 days ago
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          lastSyncTime={daysAgo}
        />
      );
      
      expect(screen.getByText(/2d ago/)).toBeInTheDocument();
    });

    it('should format old dates as date string', () => {
      const oldDate = new Date('2024-01-01T12:00:00Z'); // 2 weeks ago
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          lastSyncTime={oldDate}
        />
      );
      
      expect(screen.getByText(/1\/1\/2024/)).toBeInTheDocument();
    });

    it('should show "Never" when no last sync time', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          lastSyncTime={undefined}
        />
      );
      
      expect(screen.getByText(/Never/)).toBeInTheDocument();
    });
  });

  describe('Accessibility and Props', () => {
    it('should apply custom className', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          className="custom-class"
        />
      );
      
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('custom-class');
    });

    it('should handle missing callbacks gracefully', () => {
      const propsWithoutCallbacks = {
        status: 'error' as const,
        entityType: 'person',
        entityName: 'John Doe'
      };
      
      expect(() => {
        render(<SyncStatusIndicator {...propsWithoutCallbacks} variant="compact" />);
      }).not.toThrow();
    });

    it('should show pending changes badge in detailed view', () => {
      render(
        <SyncStatusIndicator 
          {...defaultProps} 
          variant="detailed"
          status="pending"
          pendingChanges={5}
        />
      );
      
      expect(screen.getByText('5 pending')).toBeInTheDocument();
    });
  });
});