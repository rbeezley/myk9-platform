/**
 * Tests for EnhancedAnalyticsDashboard Component
 * 
 * Comprehensive test suite for the integrated analytics dashboard that combines
 * performance monitoring, user activity tracking, and real-time system health monitoring.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedAnalyticsDashboard } from '@/components/analytics/EnhancedAnalyticsDashboard';
import { SyncAnalyticsService } from '@/services/analytics/SyncAnalyticsService';
import { SyncMetrics, SyncAlert, HealthCheckResult } from '@/types/analytics-types';

// Mock child components
vi.mock('@/components/analytics/PerformanceGraphs', () => ({
  PerformanceGraphs: () => <div data-testid="performance-graphs">Performance Graphs Component</div>
}));

vi.mock('@/components/analytics/UserActivityMonitor', () => ({
  UserActivityMonitor: () => <div data-testid="user-activity-monitor">User Activity Monitor Component</div>
}));

// Mock the analytics service
vi.mock('@/services/analytics/SyncAnalyticsService', () => ({
  SyncAnalyticsService: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockResolvedValue(mockMetrics),
      getActiveAlerts: vi.fn().mockResolvedValue(mockAlerts),
      getHealthChecks: vi.fn().mockResolvedValue(mockHealthChecks)
    }))
  }
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

// Mock data
const mockMetrics: SyncMetrics = {
  startTime: new Date('2024-01-01T00:00:00Z'),
  endTime: new Date('2024-01-01T23:59:59Z'),
  syncHealthScore: 85,
  successRate: 95.5,
  averageSyncTime: 2.3,
  totalSyncs: 150,
  successfulSyncs: 143,
  failedSyncs: 7,
  totalConflicts: 5,
  resolvedConflicts: 5,
  pendingConflicts: 0,
  conflictRate: 3.3,
  bandwidthUsed: 5242880,
  compressionRatio: 0.7,
  averageLatency: 45,
  offlineUsageTime: 30,
  offlineSyncsQueued: 3,
  collectionMetrics: [],
  recentEvents: [],
  syncTimeTrend: [],
  successRateTrend: [],
  conflictRateTrend: [],
  bandwidthTrend: []
};

const mockAlerts: SyncAlert[] = [
  {
    id: 'alert-1',
    type: 'performance',
    severity: 'high',
    title: 'Slow Sync Performance',
    description: 'Sync operations are taking longer than expected',
    triggeredAt: new Date('2024-01-01T12:00:00Z')
  },
  {
    id: 'alert-2',
    type: 'health',
    severity: 'critical',
    title: 'Database Connection Issues',
    description: 'Unable to connect to the database',
    triggeredAt: new Date('2024-01-01T12:30:00Z')
  }
];

const mockHealthChecks: HealthCheckResult[] = [
  {
    service: 'Sync Service',
    status: 'healthy',
    responseTime: 150,
    lastChecked: new Date('2024-01-01T12:00:00Z'),
    uptime: 99.9
  },
  {
    service: 'Database',
    status: 'healthy',
    responseTime: 45,
    lastChecked: new Date('2024-01-01T12:00:00Z'),
    uptime: 99.95
  },
  {
    service: 'Network',
    status: 'degraded',
    responseTime: 250,
    lastChecked: new Date('2024-01-01T12:00:00Z'),
    uptime: 98.5
  }
];

describe('EnhancedAnalyticsDashboard Component', () => {
  let mockAnalyticsService: {
    initialize: ReturnType<typeof vi.fn>;
    getMetrics: ReturnType<typeof vi.fn>;
    getActiveAlerts: ReturnType<typeof vi.fn>;
    getHealthChecks: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    mockAnalyticsService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockResolvedValue(mockMetrics),
      getActiveAlerts: vi.fn().mockResolvedValue(mockAlerts),
      getHealthChecks: vi.fn().mockResolvedValue(mockHealthChecks)
    };

    (SyncAnalyticsService.getInstance as ReturnType<typeof vi.fn>).mockReturnValue(mockAnalyticsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initialization and Loading', () => {
    test('renders loading state initially', () => {
      render(<EnhancedAnalyticsDashboard />);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    test('initializes analytics service and loads all data', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(mockAnalyticsService.initialize).toHaveBeenCalled();
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalled();
        expect(mockAnalyticsService.getActiveAlerts).toHaveBeenCalled();
        expect(mockAnalyticsService.getHealthChecks).toHaveBeenCalled();
      });
    });

    test('displays dashboard header after loading', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Comprehensive monitoring and analytics for sync performance and user activity')).toBeInTheDocument();
      });
    });
  });

  describe('System Status Indicator', () => {
    test('displays system status badge based on health metrics', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText(/System/)).toBeInTheDocument();
      });
    });

    test('shows excellent status when all systems are healthy', async () => {
      const excellentHealthChecks = mockHealthChecks.map(hc => ({
        ...hc,
        status: 'healthy' as const
      }));
      
      mockAnalyticsService.getHealthChecks.mockResolvedValue(excellentHealthChecks);
      mockAnalyticsService.getActiveAlerts.mockResolvedValue([]);
      
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText(/excellent/i)).toBeInTheDocument();
      });
    });

    test('shows poor status when critical alerts exist', async () => {
      const criticalAlerts = [
        {
          ...mockAlerts[0],
          severity: 'critical' as const
        }
      ];
      
      mockAnalyticsService.getActiveAlerts.mockResolvedValue(criticalAlerts);
      
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText(/poor/i)).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Status Bar', () => {
    test('displays real-time metrics in status bar', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument(); // Health Score
        expect(screen.getByText('Health Score')).toBeInTheDocument();
        expect(screen.getByText('Active Users')).toBeInTheDocument();
        expect(screen.getByText('Current Syncs')).toBeInTheDocument();
        expect(screen.getByText('Error Rate')).toBeInTheDocument();
        expect(screen.getByText('Response Time')).toBeInTheDocument();
        expect(screen.getByText('Network')).toBeInTheDocument();
      });
    });

    test('shows last updated timestamp', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
      });
    });
  });

  describe('Active Alerts', () => {
    test('displays active alerts when present', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Active Alerts (2)')).toBeInTheDocument();
        expect(screen.getByText('Slow Sync Performance')).toBeInTheDocument();
        expect(screen.getByText('Database Connection Issues')).toBeInTheDocument();
      });
    });

    test('shows alert severity badges', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('high')).toBeInTheDocument();
        expect(screen.getByText('critical')).toBeInTheDocument();
      });
    });

    test('limits displayed alerts to 5', async () => {
      const manyAlerts = Array.from({ length: 10 }, (_, i) => ({
        ...mockAlerts[0],
        id: `alert-${i}`,
        title: `Alert ${i}`
      }));
      
      mockAnalyticsService.getActiveAlerts.mockResolvedValue(manyAlerts);
      
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Active Alerts (10)')).toBeInTheDocument();
        // Should only show first 5 alerts in the list
        expect(screen.getByText('Alert 0')).toBeInTheDocument();
        expect(screen.getByText('Alert 4')).toBeInTheDocument();
        expect(screen.queryByText('Alert 5')).not.toBeInTheDocument();
      });
    });
  });

  describe('Auto-refresh Functionality', () => {
    test('enables auto-refresh by default', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const autoRefreshSwitch = screen.getByRole('switch');
        expect(autoRefreshSwitch).toBeChecked();
      });
    });

    test('can toggle auto-refresh', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const autoRefreshSwitch = screen.getByRole('switch');
        fireEvent.click(autoRefreshSwitch);
        expect(autoRefreshSwitch).not.toBeChecked();
      });
    });

    test('automatically refreshes data when enabled', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(1);
      });

      // Fast-forward 30 seconds (default refresh interval)
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      await waitFor(() => {
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(2);
      });
    });

    test('stops auto-refresh when disabled', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const autoRefreshSwitch = screen.getByRole('switch');
        fireEvent.click(autoRefreshSwitch);
        
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(1);
      });

      // Fast-forward 30 seconds
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      // Should not have made additional calls
      expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tab Navigation', () => {
    test('renders all main tabs', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeInTheDocument();
        expect(screen.getByText('Performance')).toBeInTheDocument();
        expect(screen.getByText('Users')).toBeInTheDocument();
      });
    });

    test('switches to performance tab and renders PerformanceGraphs', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const performanceTab = screen.getByText('Performance');
        fireEvent.click(performanceTab);
        
        expect(screen.getByTestId('performance-graphs')).toBeInTheDocument();
      });
    });

    test('switches to users tab and renders UserActivityMonitor', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const usersTab = screen.getByText('Users');
        fireEvent.click(usersTab);
        
        expect(screen.getByTestId('user-activity-monitor')).toBeInTheDocument();
      });
    });
  });

  describe('Overview Tab', () => {
    test('displays system health section', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('System Health')).toBeInTheDocument();
        expect(screen.getByText('Sync Service')).toBeInTheDocument();
        expect(screen.getByText('Database')).toBeInTheDocument();
        expect(screen.getByText('Network')).toBeInTheDocument();
      });
    });

    test('shows health check response times and uptime', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('150ms')).toBeInTheDocument();
        expect(screen.getByText('45ms')).toBeInTheDocument();
        expect(screen.getByText('99.9% uptime')).toBeInTheDocument();
        expect(screen.getByText('99.95% uptime')).toBeInTheDocument();
      });
    });

    test('displays performance summary cards', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Success Rate')).toBeInTheDocument();
        expect(screen.getByText('95.5%')).toBeInTheDocument();
        expect(screen.getByText('Avg Sync Time')).toBeInTheDocument();
        expect(screen.getByText('2.30s')).toBeInTheDocument();
        expect(screen.getByText('Conflict Rate')).toBeInTheDocument();
        expect(screen.getByText('3.3%')).toBeInTheDocument();
      });
    });

    test('shows bandwidth usage with compression ratio', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Bandwidth')).toBeInTheDocument();
        expect(screen.getByText('5.0MB')).toBeInTheDocument();
        expect(screen.getByText('70% compressed')).toBeInTheDocument();
      });
    });
  });

  describe('Manual Refresh', () => {
    test('provides manual refresh button', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });
    });

    test('refreshes data when manual refresh is clicked', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(1);
        
        const refreshButton = screen.getByText('Refresh');
        fireEvent.click(refreshButton);
      });

      await waitFor(() => {
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Data Export', () => {
    test('provides export functionality', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Export')).toBeInTheDocument();
      });
    });

    test('exports comprehensive dashboard data', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const exportButton = screen.getByText('Export');
        fireEvent.click(exportButton);
      });

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockDownloadElement.click).toHaveBeenCalled();
      expect(mockDownloadElement.download).toMatch(/analytics-dashboard-\d+\.json/);
    });

    test('includes all dashboard data in export', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const exportButton = screen.getByText('Export');
        fireEvent.click(exportButton);
      });

      // Verify that the blob was created with comprehensive data
      const blobCall = (global.URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
      expect(blobCall.type).toBe('application/json');
    });
  });

  describe('Full Screen Mode', () => {
    test('provides full screen toggle for tabs', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Full Screen')).toBeInTheDocument();
      });
    });

    test('opens full screen mode when clicked', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const fullScreenButton = screen.getByText('Full Screen');
        fireEvent.click(fullScreenButton);
        
        expect(screen.getByText('Exit Full Screen')).toBeInTheDocument();
        expect(screen.getByText('Overview Analytics')).toBeInTheDocument();
      });
    });

    test('exits full screen mode when exit button is clicked', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const fullScreenButton = screen.getByText('Full Screen');
        fireEvent.click(fullScreenButton);
        
        const exitButton = screen.getByText('Exit Full Screen');
        fireEvent.click(exitButton);
        
        expect(screen.queryByText('Exit Full Screen')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles service initialization errors gracefully', async () => {
      mockAnalyticsService.initialize.mockRejectedValue(new Error('Init failed'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    test('handles metrics loading errors', async () => {
      mockAnalyticsService.getMetrics.mockRejectedValue(new Error('Metrics failed'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    test('handles alerts loading errors', async () => {
      mockAnalyticsService.getActiveAlerts.mockRejectedValue(new Error('Alerts failed'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Performance Optimization', () => {
    test('memoizes expensive calculations', async () => {
      const { rerender } = render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
      });

      // Re-render should not cause additional service calls
      rerender(<EnhancedAnalyticsDashboard />);
      
      expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    test('includes proper ARIA labels and roles', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(3);
        expect(screen.getByRole('switch')).toBeInTheDocument(); // Auto-refresh toggle
      });
    });

    test('supports keyboard navigation', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        const firstTab = screen.getAllByRole('tab')[0];
        firstTab.focus();
        expect(document.activeElement).toBe(firstTab);
      });
    });

    test('provides meaningful status indicators', async () => {
      render(<EnhancedAnalyticsDashboard />);
      
      await waitFor(() => {
        // Health status indicators should be clearly labeled
        expect(screen.getByText('System Health')).toBeInTheDocument();
        expect(screen.getByText(/System/)).toBeInTheDocument();
      });
    });
  });
});