import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';

// Mock the UI components
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

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    size,
    ...props
  }: {
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
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-provider">{children}</div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : <div data-testid="tooltip-trigger">{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

describe('SyncStatusIndicator', () => {
  const defaultProps = {
    status: 'synced' as const,
    entityType: 'person',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without errors', () => {
      expect(() => render(<SyncStatusIndicator {...defaultProps} />)).not.toThrow();
    });

    it('should render tooltip provider in full mode', () => {
      render(<SyncStatusIndicator {...defaultProps} />);
      expect(screen.getByTestId('tooltip-provider')).toBeInTheDocument();
    });

    it('should render tooltip provider in compact mode', () => {
      render(<SyncStatusIndicator {...defaultProps} compact />);
      expect(screen.getByTestId('tooltip-provider')).toBeInTheDocument();
    });

    it('should render tooltip content with status info', () => {
      render(<SyncStatusIndicator {...defaultProps} />);
      expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
    });
  });

  describe('Status Labels (showLabel mode)', () => {
    it('should show Synced label when showLabel is true', () => {
      render(<SyncStatusIndicator status="synced" showLabel />);
      const badge = screen.getByTestId('badge');
      expect(badge).toBeInTheDocument();
      // Badge shows the label text (may also appear in tooltip, use badge specifically)
      expect(badge).toHaveTextContent('Synced');
    });

    it('should show Pending label when showLabel is true', () => {
      render(<SyncStatusIndicator status="pending" showLabel />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveTextContent('Pending');
    });

    it('should show Error label when showLabel is true', () => {
      render(<SyncStatusIndicator status="error" showLabel />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveTextContent('Error');
    });

    it('should show Conflict label when showLabel is true', () => {
      render(<SyncStatusIndicator status="conflict" showLabel />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveTextContent('Conflict');
    });

    it('should show Offline label when showLabel is true', () => {
      render(<SyncStatusIndicator status="offline" showLabel />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveTextContent('Offline');
    });

    it('should not show badge without showLabel', () => {
      render(<SyncStatusIndicator status="synced" />);
      expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
    });
  });

  describe('Tooltip Content', () => {
    it('should show status description in tooltip for synced', () => {
      render(<SyncStatusIndicator status="synced" />);
      expect(screen.getByText('All changes synchronized')).toBeInTheDocument();
    });

    it('should show status description in tooltip for pending', () => {
      render(<SyncStatusIndicator status="pending" />);
      expect(screen.getByText('Waiting to sync')).toBeInTheDocument();
    });

    it('should show status description in tooltip for error', () => {
      render(<SyncStatusIndicator status="error" />);
      expect(screen.getByText('Sync failed')).toBeInTheDocument();
    });

    it('should show status description in tooltip for conflict', () => {
      render(<SyncStatusIndicator status="conflict" />);
      expect(screen.getByText('Requires manual resolution')).toBeInTheDocument();
    });

    it('should show error message in tooltip when provided and status is error', () => {
      render(<SyncStatusIndicator status="error" errorMessage="Network timeout" />);
      expect(screen.getByText('Error: Network timeout')).toBeInTheDocument();
    });

    it('should show entityType and entityId in tooltip when both provided', () => {
      render(<SyncStatusIndicator status="synced" entityType="show" entityId="show-123" />);
      expect(screen.getByText('show: show-123')).toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('should render compact icon without badge', () => {
      render(<SyncStatusIndicator status="synced" compact />);
      // In compact mode, no badge — just icon in tooltip
      expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
    });

    it('should render tooltip in compact mode', () => {
      render(<SyncStatusIndicator status="error" compact />);
      expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    });
  });

  describe('Quick Actions (enableActions)', () => {
    it('should show retry button for error status when enableActions and onRetry provided', () => {
      const onRetry = vi.fn();
      render(<SyncStatusIndicator status="error" enableActions onRetry={onRetry} />);
      const retryButton = screen.getByRole('button', { name: /retry sync for/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('should call onRetry when retry button is clicked', () => {
      const onRetry = vi.fn();
      render(<SyncStatusIndicator status="error" enableActions onRetry={onRetry} />);
      const retryButton = screen.getByRole('button', { name: /retry sync for/i });
      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalledOnce();
    });

    it('should show retry button for conflict status when enableActions and onRetry provided', () => {
      const onRetry = vi.fn();
      render(<SyncStatusIndicator status="conflict" enableActions onRetry={onRetry} />);
      const retryButton = screen.getByRole('button', { name: /retry sync for/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('should not show retry button for synced status even when enableActions', () => {
      const onRetry = vi.fn();
      render(<SyncStatusIndicator status="synced" enableActions onRetry={onRetry} />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('should not show retry button when enableActions is false', () => {
      const onRetry = vi.fn();
      render(<SyncStatusIndicator status="error" enableActions={false} onRetry={onRetry} />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('should not show retry button when onRetry is not provided', () => {
      render(<SyncStatusIndicator status="error" enableActions />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  describe('Last Sync Time in Tooltip', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should show last sync time in tooltip when lastSyncAt provided', () => {
      const lastSyncAt = new Date('2024-01-15T11:55:00Z'); // 5 minutes ago
      render(<SyncStatusIndicator status="synced" lastSyncAt={lastSyncAt} />);
      expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
    });

    it('should format recent sync time as "Just now"', () => {
      const recentTime = new Date('2024-01-15T11:59:30Z'); // 30 seconds ago
      render(<SyncStatusIndicator status="synced" lastSyncAt={recentTime} />);
      expect(screen.getByText(/Just now/)).toBeInTheDocument();
    });

    it('should format minutes ago correctly', () => {
      const minutesAgo = new Date('2024-01-15T11:55:00Z'); // 5 minutes ago
      render(<SyncStatusIndicator status="synced" lastSyncAt={minutesAgo} />);
      expect(screen.getByText(/5m ago/)).toBeInTheDocument();
    });

    it('should format hours ago correctly', () => {
      const hoursAgo = new Date('2024-01-15T10:00:00Z'); // 2 hours ago
      render(<SyncStatusIndicator status="synced" lastSyncAt={hoursAgo} />);
      expect(screen.getByText(/2h ago/)).toBeInTheDocument();
    });

    it('should format days ago correctly', () => {
      const daysAgo = new Date('2024-01-13T12:00:00Z'); // 2 days ago
      render(<SyncStatusIndicator status="synced" lastSyncAt={daysAgo} />);
      expect(screen.getByText(/2d ago/)).toBeInTheDocument();
    });

    it('should show date string for old dates', () => {
      const oldDate = new Date('2024-01-01T12:00:00Z'); // 2 weeks ago
      render(<SyncStatusIndicator status="synced" lastSyncAt={oldDate} />);
      // Should show formatted date string
      expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className to wrapper element', () => {
      const { container } = render(
        <SyncStatusIndicator status="synced" className="custom-class" />
      );
      const wrapper = container.querySelector('.custom-class');
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('Missing callbacks handled gracefully', () => {
    it('should not throw when onRetry is missing', () => {
      expect(() => render(<SyncStatusIndicator status="error" enableActions />)).not.toThrow();
    });

    it('should render all status types without errors', () => {
      const statuses = ['synced', 'pending', 'error', 'conflict', 'offline'] as const;
      for (const status of statuses) {
        expect(() => render(<SyncStatusIndicator status={status} />)).not.toThrow();
      }
    });
  });
});
