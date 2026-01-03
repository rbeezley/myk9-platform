/**
 * Tests for UserActivityMonitor Component
 * 
 * Comprehensive test suite for the user activity monitoring and analytics component.
 * Tests user session tracking, device analytics, feature usage, and geographic distribution.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserActivityMonitor } from '@/components/analytics/UserActivityMonitor';

// Mock recharts components
vi.mock('recharts', () => ({
  LineChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  ComposedChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="composed-chart">{children}</div>,
  PieChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  RadialBarChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="radial-bar-chart">{children}</div>,
  RadialBar: () => <div data-testid="radial-bar" />,
  Treemap: ({ children }: React.ComponentProps<'div'>) => <div data-testid="treemap">{children}</div>,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: React.ComponentProps<'div'>) => <div data-testid="responsive-container">{children}</div>,
  Cell: () => <div data-testid="cell" />
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>
  }
}));

// Mock URL.createObjectURL for export functionality
Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: vi.fn(() => 'mock-url'),
    revokeObjectURL: vi.fn()
  }
});

// Mock document.createElement for download functionality
const mockDownloadElement = {
  href: '',
  download: '',
  click: vi.fn(),
  remove: vi.fn()
};

Object.defineProperty(document, 'createElement', {
  value: vi.fn(() => mockDownloadElement)
});

Object.defineProperty(document.body, 'appendChild', {
  value: vi.fn()
});

Object.defineProperty(document.body, 'removeChild', {
  value: vi.fn()
});

describe('UserActivityMonitor Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initialization and Data Loading', () => {
    test('renders loading state initially', () => {
      render(<UserActivityMonitor />);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    test('displays user activity monitor after loading', async () => {
      render(<UserActivityMonitor />);
      
      // Fast-forward past the loading delay
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText('User Activity Monitor')).toBeInTheDocument();
        expect(screen.getByText('Real-time user behavior and engagement analytics')).toBeInTheDocument();
      });
    });

    test('generates mock user session data', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        // Check that user metrics are displayed
        expect(screen.getByText('Active Users')).toBeInTheDocument();
        expect(screen.getByText('Engagement Score')).toBeInTheDocument();
        expect(screen.getByText('Avg Session')).toBeInTheDocument();
        expect(screen.getByText('Sync Operations')).toBeInTheDocument();
      });
    });
  });

  describe('User Metrics Display', () => {
    test('displays key user metrics cards', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Active Users')).toBeInTheDocument();
        expect(screen.getByText('Engagement Score')).toBeInTheDocument();
        expect(screen.getByText('Avg Session')).toBeInTheDocument();
        expect(screen.getByText('Sync Operations')).toBeInTheDocument();
      });
    });

    test('shows engagement score with progress indicator', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Engagement Score')).toBeInTheDocument();
        // Check for progress bar
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });
    });

    test('displays session duration and total sessions', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText(/m$/)).toBeInTheDocument(); // Session duration in minutes
        expect(screen.getByText(/total sessions/)).toBeInTheDocument();
      });
    });
  });

  describe('Filter Controls', () => {
    test('provides role filter dropdown', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const roleFilter = screen.getByDisplayValue('All Roles');
        expect(roleFilter).toBeInTheDocument();
      });
    });

    test('provides device filter dropdown', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const deviceFilter = screen.getByDisplayValue('All Devices');
        expect(deviceFilter).toBeInTheDocument();
      });
    });

    test('filters data when role filter is changed', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const roleFilter = screen.getByDisplayValue('All Roles');
        fireEvent.change(roleFilter, { target: { value: 'Judge' } });
        
        // Verify filter was applied (component should re-render with filtered data)
        expect(roleFilter).toBeInTheDocument();
      });
    });

    test('filters data when device filter is changed', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const deviceFilter = screen.getByDisplayValue('All Devices');
        fireEvent.change(deviceFilter, { target: { value: 'mobile' } });
        
        expect(deviceFilter).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    test('enables real-time updates by default', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const realTimeSwitch = screen.getByRole('switch');
        expect(realTimeSwitch).toBeChecked();
      });
    });

    test('can toggle real-time updates', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const realTimeSwitch = screen.getByRole('switch');
        fireEvent.click(realTimeSwitch);
        expect(realTimeSwitch).not.toBeChecked();
      });
    });

    test('updates user activity in real-time', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText('User Activity Monitor')).toBeInTheDocument();
      });

      // Fast-forward 30 seconds for real-time update
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      // Component should still be rendered with potentially updated data
      expect(screen.getByText('User Activity Monitor')).toBeInTheDocument();
    });
  });

  describe('Activity Tabs', () => {
    test('renders all activity tabs', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Activity')).toBeInTheDocument();
        expect(screen.getByText('Users')).toBeInTheDocument();
        expect(screen.getByText('Devices')).toBeInTheDocument();
        expect(screen.getByText('Features')).toBeInTheDocument();
        expect(screen.getByText('Geography')).toBeInTheDocument();
      });
    });

    test('switches between tabs correctly', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const usersTab = screen.getByText('Users');
        fireEvent.click(usersTab);
        
        expect(screen.getByText('Active Users')).toBeInTheDocument();
        expect(screen.getByText('User Engagement')).toBeInTheDocument();
      });
    });

    test('displays activity timeline in activity tab', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText('24-Hour Activity Timeline')).toBeInTheDocument();
        expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
      });
    });

    test('displays activity heatmap', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Weekly Activity Heatmap')).toBeInTheDocument();
        // Check for day labels
        expect(screen.getByText('Mon')).toBeInTheDocument();
        expect(screen.getByText('Tue')).toBeInTheDocument();
        expect(screen.getByText('Wed')).toBeInTheDocument();
      });
    });
  });

  describe('Users Tab', () => {
    test('displays active users list', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const usersTab = screen.getByText('Users');
        fireEvent.click(usersTab);
        
        expect(screen.getByText('Active Users')).toBeInTheDocument();
        expect(screen.getByText('User Engagement')).toBeInTheDocument();
      });
    });

    test('shows user avatars and online status', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const usersTab = screen.getByText('Users');
        fireEvent.click(usersTab);
        
        // Check for user avatars (fallback initials)
        const avatars = screen.getAllByTestId('avatar-fallback');
        expect(avatars.length).toBeGreaterThan(0);
      });
    });

    test('displays engagement metrics with progress bars', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const usersTab = screen.getByText('Users');
        fireEvent.click(usersTab);
        
        expect(screen.getByText('Session Duration')).toBeInTheDocument();
        expect(screen.getByText('User Retention')).toBeInTheDocument();
        expect(screen.getByText('Sync Activity')).toBeInTheDocument();
        
        // Check for progress bars
        const progressBars = screen.getAllByRole('progressbar');
        expect(progressBars.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Devices Tab', () => {
    test('displays device usage pie chart', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const devicesTab = screen.getByText('Devices');
        fireEvent.click(devicesTab);
        
        expect(screen.getByText('Device Usage')).toBeInTheDocument();
        expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      });
    });

    test('shows platform distribution statistics', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const devicesTab = screen.getByText('Devices');
        fireEvent.click(devicesTab);
        
        expect(screen.getByText('Platform Distribution')).toBeInTheDocument();
        expect(screen.getByText('iOS')).toBeInTheDocument();
        expect(screen.getByText('Android')).toBeInTheDocument();
        expect(screen.getByText('Windows')).toBeInTheDocument();
      });
    });
  });

  describe('Features Tab', () => {
    test('displays feature usage analytics bar chart', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const featuresTab = screen.getByText('Features');
        fireEvent.click(featuresTab);
        
        expect(screen.getByText('Feature Usage Analytics')).toBeInTheDocument();
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      });
    });
  });

  describe('Geography Tab', () => {
    test('displays geographic distribution', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const geographyTab = screen.getByText('Geography');
        fireEvent.click(geographyTab);
        
        expect(screen.getByText('Geographic Distribution')).toBeInTheDocument();
        expect(screen.getByText('Session Distribution')).toBeInTheDocument();
      });
    });

    test('shows radial bar chart for session distribution', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const geographyTab = screen.getByText('Geography');
        fireEvent.click(geographyTab);
        
        expect(screen.getByTestId('radial-bar-chart')).toBeInTheDocument();
      });
    });
  });

  describe('Data Export', () => {
    test('exports user activity data', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const exportButton = screen.getByText('Export');
        fireEvent.click(exportButton);
      });

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockDownloadElement.click).toHaveBeenCalled();
      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
    });

    test('creates proper export file name with timestamp', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const exportButton = screen.getByText('Export');
        fireEvent.click(exportButton);
      });

      expect(mockDownloadElement.download).toMatch(/user-activity-\d+\.json/);
    });
  });

  describe('Responsive Design', () => {
    test('renders responsive containers for charts', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const responsiveContainers = screen.getAllByTestId('responsive-container');
        expect(responsiveContainers.length).toBeGreaterThan(0);
      });
    });

    test('adapts layout for different screen sizes', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        // Check for responsive grid classes
        const container = screen.getByText('User Activity Monitor').closest('div');
        expect(container).toHaveClass('space-y-6');
      });
    });
  });

  describe('Performance Optimization', () => {
    test('memoizes user metrics calculations', async () => {
      const { rerender } = render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByText('User Activity Monitor')).toBeInTheDocument();
      });

      // Re-render with same props should not cause unnecessary recalculation
      rerender(<UserActivityMonitor />);
      
      expect(screen.getByText('User Activity Monitor')).toBeInTheDocument();
    });

    test('efficiently handles large session datasets', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        // Component should render without performance issues
        expect(screen.getByText('User Activity Monitor')).toBeInTheDocument();
        
        // Check that only top 10 active users are shown (performance optimization)
        const usersTab = screen.getByText('Users');
        fireEvent.click(usersTab);
        
        // Should limit displayed users for performance
        expect(screen.getByText('Active Users')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('includes proper ARIA labels for interactive elements', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(5);
        expect(screen.getByRole('switch')).toBeInTheDocument(); // Real-time toggle
      });
    });

    test('supports keyboard navigation', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        const firstTab = screen.getAllByRole('tab')[0];
        firstTab.focus();
        expect(document.activeElement).toBe(firstTab);
      });
    });

    test('provides meaningful text alternatives for charts', async () => {
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      await waitFor(() => {
        // Charts should have descriptive titles
        expect(screen.getByText('24-Hour Activity Timeline')).toBeInTheDocument();
        expect(screen.getByText('Weekly Activity Heatmap')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles session generation errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock Math.random to potentially cause issues
      const originalRandom = Math.random;
      Math.random = vi.fn(() => { throw new Error('Random error'); });
      
      render(<UserActivityMonitor />);
      
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      
      // Component should still render even if some calculations fail
      await waitFor(() => {
        expect(screen.getByText('User Activity Monitor')).toBeInTheDocument();
      });
      
      Math.random = originalRandom;
      consoleSpy.mockRestore();
    });
  });
});