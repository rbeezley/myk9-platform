import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Zap, 
  Database, 
  Clock, 
  TrendingUp, 
  EyeOff,
  RefreshCw 
} from 'lucide-react';
import { useSearchAnalytics } from '@/lib/searchCache';

interface PerformanceStats {
  totalSearches: number;
  cacheHitRate: number;
  averageResponseTime: number;
  popularQueries: { query: string; count: number }[];
}

export const SearchPerformanceMonitor: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const { getSearchStats } = useSearchAnalytics();

  const refreshStats = () => {
    const newStats = getSearchStats();
    setStats(newStats);
  };

  useEffect(() => {
    const doRefresh = () => {
      const newStats = getSearchStats();
      setStats(newStats);
    };

    if (isVisible) {
      doRefresh();
      // Refresh every 5 seconds when visible
      const interval = setInterval(doRefresh, 5000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isVisible, getSearchStats]);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsVisible(true)}
          className="shadow-lg bg-background/95 backdrop-blur"
        >
          <Activity className="h-3 w-3 mr-1" />
          Search Stats
        </Button>
      </div>
    );
  }

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getPerformanceColor = (value: number, type: 'responseTime' | 'cacheHit') => {
    if (type === 'responseTime') {
      if (value < 200) return 'text-green-600';
      if (value < 500) return 'text-yellow-600';
      return 'text-red-600';
    } else {
      if (value > 0.8) return 'text-green-600';
      if (value > 0.5) return 'text-yellow-600';
      return 'text-red-600';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <Card className="shadow-xl bg-background/95 backdrop-blur border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Search Performance
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshStats}
                className="h-6 w-6 p-0"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsVisible(false)}
                className="h-6 w-6 p-0"
              >
                <EyeOff className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats ? (
            <>
              {/* Overview Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Database className="h-3 w-3" />
                    Total Searches
                  </div>
                  <div className="text-lg font-medium">{stats.totalSearches}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Avg Response
                  </div>
                  <div className={`text-lg font-medium ${getPerformanceColor(stats.averageResponseTime, 'responseTime')}`}>
                    {formatResponseTime(stats.averageResponseTime)}
                  </div>
                </div>
              </div>

              {/* Cache Hit Rate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3" />
                    Cache Hit Rate
                  </div>
                  <Badge 
                    variant={stats.cacheHitRate > 0.8 ? "default" : stats.cacheHitRate > 0.5 ? "secondary" : "destructive"}
                    className="text-xs"
                  >
                    {(stats.cacheHitRate * 100).toFixed(1)}%
                  </Badge>
                </div>
                <Progress 
                  value={stats.cacheHitRate * 100} 
                  className="h-2"
                />
              </div>

              {/* Popular Queries */}
              {stats.popularQueries.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    Popular Queries
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {stats.popularQueries.slice(0, 5).map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-xs">
                        <span className="truncate flex-1 mr-2">"{item.query}"</span>
                        <Badge variant="outline" className="text-xs min-w-fit">
                          {item.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance Indicators */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full ${stats.cacheHitRate > 0.8 ? 'bg-green-500' : stats.cacheHitRate > 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                  Cache Performance
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full ${stats.averageResponseTime < 200 ? 'bg-green-500' : stats.averageResponseTime < 500 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                  Response Time
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-sm text-muted-foreground">No search data available</div>
              <div className="text-xs text-muted-foreground mt-1">
                Perform some searches to see statistics
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Real-time search performance indicator for search inputs
interface SearchPerformanceIndicatorProps {
  isSearching: boolean;
  responseTime: number;
  cacheHit: boolean;
  resultCount?: number;
}

export const SearchPerformanceIndicator: React.FC<SearchPerformanceIndicatorProps> = ({
  isSearching,
  responseTime,
  cacheHit,
  resultCount
}) => {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {isSearching ? (
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          Searching...
        </div>
      ) : (
        <>
          {responseTime > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {responseTime < 1000 ? `${Math.round(responseTime)}ms` : `${(responseTime / 1000).toFixed(1)}s`}
            </div>
          )}
          {cacheHit && (
            <Badge variant="outline" className="text-xs h-4">
              <Zap className="h-2 w-2 mr-1" />
              Cached
            </Badge>
          )}
          {resultCount !== undefined && (
            <div className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              {resultCount} results
            </div>
          )}
        </>
      )}
    </div>
  );
};