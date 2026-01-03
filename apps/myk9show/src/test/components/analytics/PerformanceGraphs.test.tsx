/**
 * Tests for PerformanceGraphs Component
 * 
 * Comprehensive test suite for the performance monitoring and visualization component.
 * Tests chart rendering, data filtering, real-time updates, and export functionality.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceGraphs } from '@/components/analytics/PerformanceGraphs';
import { SyncAnalyticsService } from '@/services/analytics/SyncAnalyticsService';
import { SyncMetrics } from '@/types/analytics-types';

// Mock the analytics service
vi.mock('@/services/analytics/SyncAnalyticsService', () => ({
  SyncAnalyticsService: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockResolvedValue(mockMetrics),
      exportData: vi.fn().mockResolvedValue(new Blob(['test data'], { type: 'application/json' }))
    }))
  }
}));

// Mock recharts components to avoid canvas issues in tests
vi.mock('recharts', () => ({
  LineChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  ScatterChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="scatter-chart">{children}</div>,
  Scatter: () => <div data-testid="scatter" />,
  ComposedChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="composed-chart">{children}</div>,
  PieChart: ({ children }: React.ComponentProps<'div'>) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: React.ComponentProps<'div'>) => <div data-testid="responsive-container">{children}</div>,
  ReferenceLine: () => <div data-testid="reference-line" />,
  Cell: () => <div data-testid="cell" />
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>
  }
}));

// Mock URL.createObjectURL and related APIs
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

// Mock metrics data
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
  bandwidthUsed: 5242880, // 5MB
  compressionRatio: 0.7,
  averageLatency: 45,
  offlineUsageTime: 30,
  offlineSyncsQueued: 3,
  collectionMetrics: [],
  recentEvents: [
    {
      id: 'event-1',
      type: 'sync_completed',
      timestamp: new Date('2024-01-01T12:00:00Z'),
      duration: 2000,
      status: 'completed',
      collectionName: 'dogs',
      recordCount: 10,
      bytesTransferred: 1024
    },
    {
      id: 'event-2',
      type: 'sync_completed',
      timestamp: new Date('2024-01-01T12:05:00Z'),
      duration: 1500,
      status: 'completed',
      collectionName: 'shows',
      recordCount: 5,
      bytesTransferred: 512
    }
  ],
  syncTimeTrend: [
    { timestamp: new Date('2024-01-01T10:00:00Z'), value: 2.1 },
    { timestamp: new Date('2024-01-01T11:00:00Z'), value: 2.3 },
    { timestamp: new Date('2024-01-01T12:00:00Z'), value: 2.0 }
  ],
  successRateTrend: [
    { timestamp: new Date('2024-01-01T10:00:00Z'), value: 96.0 },
    { timestamp: new Date('2024-01-01T11:00:00Z'), value: 95.5 },
    { timestamp: new Date('2024-01-01T12:00:00Z'), value: 97.0 }
  ],
  conflictRateTrend: [
    { timestamp: new Date('2024-01-01T10:00:00Z'), value: 3.0 },
    { timestamp: new Date('2024-01-01T11:00:00Z'), value: 3.5 },
    { timestamp: new Date('2024-01-01T12:00:00Z'), value: 2.8 }
  ],
  bandwidthTrend: [
    { timestamp: new Date('2024-01-01T10:00:00Z'), value: 1.5 },
    { timestamp: new Date('2024-01-01T11:00:00Z'), value: 2.1 },
    { timestamp: new Date('2024-01-01T12:00:00Z'), value: 1.8 }
  ]
};

describe('PerformanceGraphs Component', () => {
  let mockAnalyticsService: {
    initialize: ReturnType<typeof vi.fn>;
    getMetrics: ReturnType<typeof vi.fn>;
    exportData: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyticsService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockResolvedValue(mockMetrics),
      exportData: vi.fn().mockResolvedValue(new Blob(['test data'], { type: 'application/json' }))
    };

    (SyncAnalyticsService.getInstance as ReturnType<typeof vi.fn>).mockReturnValue(mockAnalyticsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization and Data Loading', () => {
    test('renders loading state initially', () => {
      render(<PerformanceGraphs />);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    test('initializes analytics service and loads metrics', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(mockAnalyticsService.initialize).toHaveBeenCalled();
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalled();
      });
    });

    test('displays performance metrics after loading', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(screen.getByText('Performance Graphs')).toBeInTheDocument();
        expect(screen.getByText('85%')).toBeInTheDocument(); // Health score
        expect(screen.getByText('2.30s')).toBeInTheDocument(); // Avg sync time
        expect(screen.getByText('95.5%')).toBeInTheDocument(); // Success rate
      });
    });
  });

  describe('Time Range Selection', () => {
    test('allows time range selection', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const timeRangeSelect = screen.getByRole('combobox');
      fireEvent.click(timeRangeSelect);
      
      await waitFor(() => {
        expect(screen.getByText('1 Hour')).toBeInTheDocument();
        expect(screen.getByText('6 Hours')).toBeInTheDocument();
        expect(screen.getByText('24 Hours')).toBeInTheDocument();
      });
    });

    test('updates metrics when time range changes', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(1);
      });

      const timeRangeSelect = screen.getByRole('combobox');
      fireEvent.click(timeRangeSelect);
      
      const oneHourOption = screen.getByText('1 Hour');
      fireEvent.click(oneHourOption);
      
      await waitFor(() => {
        expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Real-time Updates', () => {
    test('enables real-time updates by default', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const realTimeSwitch = screen.getByRole('switch');
        expect(realTimeSwitch).toBeChecked();
      });
    });

    test('can toggle real-time updates', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const realTimeSwitch = screen.getByRole('switch');
        fireEvent.click(realTimeSwitch);
        expect(realTimeSwitch).not.toBeChecked();
      });
    });

    test('automatically refreshes data when real-time is enabled', async () => {
      vi.useFakeTimers();
      
      render(<PerformanceGraphs />);
      
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

      vi.useRealTimers();
    });
  });

  describe('Chart Rendering', () => {
    test('renders all chart types in overview tab', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
        expect(screen.getByTestId('area-chart')).toBeInTheDocument();
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      });
    });

    test('renders trends tab with multi-metric chart', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const trendsTab = screen.getByText('Trends');
        fireEvent.click(trendsTab);
        
        expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
      });
    });

    test('renders percentiles tab with performance distribution', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const percentilesTab = screen.getByText('Percentiles');
        fireEvent.click(percentilesTab);
        
        expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      });
    });

    test('renders regression analysis tab', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const analysisTab = screen.getByText('Analysis');
        fireEvent.click(analysisTab);
        
        expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
      });
    });
  });

  describe('Performance Status Indicators', () => {
    test('displays correct status badges based on performance', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        // Health score badge
        expect(screen.getByText('Good')).toBeInTheDocument();
        
        // Performance status indicators
        expect(screen.getByText('GOOD')).toBeInTheDocument(); // Sync time status
      });
    });

    test('shows performance thresholds in charts', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(screen.getAllByTestId('reference-line')).toHaveLength(3); // Reference lines for thresholds
      });
    });
  });

  describe('Data Export Functionality', () => {
    test('exports chart data as JSON', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const exportButton = screen.getByText('Export');
        fireEvent.click(exportButton);
      });

      expect(mockAnalyticsService.exportData).toHaveBeenCalledWith(
        mockMetrics.startTime,
        mockMetrics.endTime,
        'json'
      );
      
      expect(mockDownloadElement.click).toHaveBeenCalled();
    });

    test('handles export errors gracefully', async () => {
      mockAnalyticsService.exportData.mockRejectedValue(new Error('Export failed'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const exportButton = screen.getByText('Export');
        fireEvent.click(exportButton);
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Export failed:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Performance Regression Analysis', () => {
    test('calculates and displays regression trend', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const analysisTab = screen.getByText('Analysis');
        fireEvent.click(analysisTab);
        
        expect(screen.getByText('Performance Regression Analysis')).toBeInTheDocument();
        expect(screen.getByText(/Performance is/)).toBeInTheDocument();
      });
    });

    test('shows improving trend badge when performance is getting better', async () => {
      // Mock data with improving trend (decreasing sync times)
      const improvingMetrics = {
        ...mockMetrics,
        syncTimeTrend: [
          { timestamp: new Date('2024-01-01T10:00:00Z'), value: 3.0 },
          { timestamp: new Date('2024-01-01T11:00:00Z'), value: 2.5 },
          { timestamp: new Date('2024-01-01T12:00:00Z'), value: 2.0 }
        ]
      };
      
      mockAnalyticsService.getMetrics.mockResolvedValue(improvingMetrics);
      
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const analysisTab = screen.getByText('Analysis');
        fireEvent.click(analysisTab);
        
        expect(screen.getByText('Improving')).toBeInTheDocument();
      });
    });
  });

  describe('Responsive Design', () => {
    test('renders responsive containers for all charts', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const responsiveContainers = screen.getAllByTestId('responsive-container');
        expect(responsiveContainers.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    test('handles analytics service initialization errors', async () => {
      mockAnalyticsService.initialize.mockRejectedValue(new Error('Init failed'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    test('handles metrics loading errors gracefully', async () => {
      mockAnalyticsService.getMetrics.mockRejectedValue(new Error('Metrics failed'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load metrics:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Performance Optimization', () => {
    test('memoizes expensive calculations', async () => {
      const { rerender } = render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(screen.getByText('Performance Graphs')).toBeInTheDocument();
      });

      // Re-render with same data should not recalculate
      rerender(<PerformanceGraphs />);
      
      // Verify memoization by checking service calls haven't increased
      expect(mockAnalyticsService.getMetrics).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    test('includes proper ARIA labels and roles', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(4);
        expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      });
    });

    test('supports keyboard navigation', async () => {
      render(<PerformanceGraphs />);
      
      await waitFor(() => {
        const firstTab = screen.getAllByRole('tab')[0];
        firstTab.focus();
        expect(document.activeElement).toBe(firstTab);
      });
    });
  });
});