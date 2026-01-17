import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { 
  Activity, 
  Clock, 
  Database, 
  Zap,
  TrendingUp,
  MemoryStick,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion } from 'framer-motion';

interface PerformanceMetrics {
  renderTime: number;
  itemsRendered: number;
  virtualizedItems: number;
  cacheHits: number;
  cacheMisses: number;
  memoryUsage: number;
  scrollPosition: number;
  visibleItems: number;
  totalLoadTime: number;
}

interface PaginationPerformanceMonitorProps {
  itemCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  cacheStats?: {
    hits: number;
    misses: number;
    size: number;
  };
  renderMetrics?: {
    renderTime: number;
    virtualizedItems: number;
  };
  className?: string;
  minimized?: boolean;
  onToggleMinimize?: () => void;
}

export function PaginationPerformanceMonitor({
  itemCount,
  pageSize,
  currentPage,
  totalPages,
  cacheStats,
  renderMetrics,
  className = '',
  minimized = false,
  onToggleMinimize
}: PaginationPerformanceMonitorProps) {
  // State for metrics that change independently of props
  const [internalMetrics, setInternalMetrics] = useState<{
    memoryUsage: number;
    scrollPosition: number;
  }>({
    memoryUsage: 0,
    scrollPosition: 0
  });

  const [performanceHistory, setPerformanceHistory] = useState<number[]>([]);

  // Track last update time as state with lazy initialization
  const [lastUpdateTime] = useState<number>(() => Date.now());

  // Compute metrics from props
  const metrics: PerformanceMetrics = {
    renderTime: renderMetrics?.renderTime || 0,
    itemsRendered: itemCount,
    virtualizedItems: renderMetrics?.virtualizedItems || 0,
    cacheHits: cacheStats?.hits || 0,
    cacheMisses: cacheStats?.misses || 0,
    memoryUsage: internalMetrics.memoryUsage,
    scrollPosition: internalMetrics.scrollPosition,
    visibleItems: Math.min(pageSize, itemCount),
    totalLoadTime: 0
  };

  // Monitor scroll performance
  useEffect(() => {
    let frameId: number;
    let lastScrollTime = performance.now();

    const handleScroll = () => {
      const now = performance.now();
      const scrollDelta = now - lastScrollTime;

      setInternalMetrics(prev => ({
        ...prev,
        scrollPosition: window.scrollY
      }));

      // Track performance history
      setPerformanceHistory(prev => {
        const newHistory = [...prev, scrollDelta].slice(-20); // Keep last 20 measurements
        return newHistory;
      });

      lastScrollTime = now;
    };

    const throttledScroll = () => {
      frameId = requestAnimationFrame(handleScroll);
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', throttledScroll);
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, []);

  // Memory usage monitoring (approximate)
  useEffect(() => {
    const updateMemoryUsage = () => {
      if ('memory' in performance) {
        const memInfo = (performance as { memory: { usedJSHeapSize: number } }).memory;
        setInternalMetrics(prev => ({
          ...prev,
          memoryUsage: memInfo.usedJSHeapSize / 1024 / 1024 // Convert to MB
        }));
      }
    };

    const interval = setInterval(updateMemoryUsage, 2000);
    updateMemoryUsage();

    return () => clearInterval(interval);
  }, []);

  const calculateCacheHitRate = () => {
    const total = metrics.cacheHits + metrics.cacheMisses;
    return total > 0 ? (metrics.cacheHits / total) * 100 : 0;
  };

  const getPerformanceScore = () => {
    const avgRenderTime = performanceHistory.length > 0 
      ? performanceHistory.reduce((a, b) => a + b, 0) / performanceHistory.length 
      : metrics.renderTime;

    if (avgRenderTime < 16) return { score: 95, level: 'Excellent', color: 'text-green-600' };
    if (avgRenderTime < 33) return { score: 80, level: 'Good', color: 'text-blue-600' };
    if (avgRenderTime < 50) return { score: 60, level: 'Fair', color: 'text-yellow-600' };
    return { score: 40, level: 'Poor', color: 'text-red-600' };
  };

  const performanceScore = getPerformanceScore();
  const cacheHitRate = calculateCacheHitRate();

  // Minimized view
  if (minimized) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`fixed bottom-4 right-4 z-50 ${className}`}
      >
        <Card className="w-64 shadow-lg border-2">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <Badge variant={performanceScore.score > 80 ? 'default' : 'secondary'}>
                  {performanceScore.level}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleMinimize}
                className="h-6 w-6 p-0"
              >
                <Eye className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <div>Items: {itemCount.toLocaleString()}</div>
              <div>Page: {currentPage}/{totalPages}</div>
              <div>Cache: {cacheHitRate.toFixed(0)}%</div>
              <div>Memory: {metrics.memoryUsage.toFixed(1)}MB</div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // Full view
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Pagination Performance
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge 
                variant={performanceScore.score > 80 ? 'default' : 'secondary'}
                className={performanceScore.color}
              >
                {performanceScore.level} ({performanceScore.score})
              </Badge>
              {onToggleMinimize && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleMinimize}
                  className="h-6 w-6 p-0"
                >
                  <EyeOff className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Database className="h-3 w-3" />
                Items Rendered
              </div>
              <div className="text-2xl font-bold">{metrics.itemsRendered.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                of {(totalPages * pageSize).toLocaleString()} total
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                Render Time
              </div>
              <div className="text-2xl font-bold">{metrics.renderTime.toFixed(1)}ms</div>
              <div className="text-xs text-muted-foreground">
                Target: &lt;16ms (60fps)
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Zap className="h-3 w-3" />
                Cache Hit Rate
              </div>
              <div className="text-2xl font-bold">{cacheHitRate.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">
                {metrics.cacheHits} hits, {metrics.cacheMisses} misses
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MemoryStick className="h-3 w-3" />
                Memory Usage
              </div>
              <div className="text-2xl font-bold">{metrics.memoryUsage.toFixed(1)}MB</div>
              <div className="text-xs text-muted-foreground">
                JavaScript heap
              </div>
            </div>
          </div>

          {/* Performance Progress Bars */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Overall Performance</span>
                <span className={performanceScore.color}>{performanceScore.score}/100</span>
              </div>
              <Progress 
                value={performanceScore.score} 
                className="h-2"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Cache Efficiency</span>
                <span>{cacheHitRate.toFixed(1)}%</span>
              </div>
              <Progress 
                value={cacheHitRate} 
                className="h-2"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>Loading Progress</span>
                <span>{currentPage}/{totalPages} pages</span>
              </div>
              <Progress 
                value={(currentPage / totalPages) * 100} 
                className="h-2"
              />
            </div>
          </div>

          {/* Performance Tips */}
          <div className="pt-3 border-t">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Performance Insights
            </h4>
            <div className="space-y-1 text-xs text-muted-foreground">
              {performanceScore.score < 80 && (
                <div>• Consider reducing page size or enabling virtualization</div>
              )}
              {cacheHitRate < 70 && (
                <div>• Cache hit rate is low, consider increasing cache size</div>
              )}
              {metrics.memoryUsage > 50 && (
                <div>• Memory usage is high, consider pagination cleanup</div>
              )}
              {metrics.renderTime > 16 && (
                <div>• Render time exceeds 60fps target, optimize rendering</div>
              )}
              {performanceScore.score >= 80 && cacheHitRate >= 70 && (
                <div className="text-green-600">• Performance is optimal!</div>
              )}
            </div>
          </div>

          {/* Technical Details */}
          {process.env.NODE_ENV === 'development' && (
            <details className="pt-3 border-t">
              <summary className="text-sm font-medium cursor-pointer">Technical Details</summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground font-mono">
                <div>Visible Items: {metrics.visibleItems}</div>
                <div>Virtualized: {metrics.virtualizedItems}</div>
                <div>Scroll Position: {metrics.scrollPosition.toFixed(0)}px</div>
                <div>Last Update: {new Date(lastUpdateTime).toLocaleTimeString()}</div>
                <div>Load Time: {metrics.totalLoadTime.toFixed(2)}ms</div>
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Hook moved to separate file to avoid Fast Refresh issues