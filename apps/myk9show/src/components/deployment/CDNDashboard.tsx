import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logger } from '@/services/LoggingService';
import {
  Upload, 
  Zap, 
  BarChart3, 
  RefreshCw, 
  HardDrive,
  Globe,
  Clock,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { CDNService, type CDNAnalytics, type CacheStats, type AnalyticsTimeRange } from '@/services/deployment/CDNService';
import { formatBytes } from '@/utils/format';

interface CDNDashboardProps {
  className?: string;
}

export const CDNDashboard: React.FC<CDNDashboardProps> = ({ className }) => {
  const [cdnService] = useState(() => CDNService.getInstance());
  const [analytics, setAnalytics] = useState<CDNAnalytics | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('24h');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [invalidationPaths, setInvalidationPaths] = useState<string>('');
  const [isInvalidating, setIsInvalidating] = useState(false);

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await cdnService.getAnalytics(timeRange);
      setAnalytics(data);
    } catch (error) {
      logger.error('Failed to load CDN analytics:', 'components', {}, error as Error);
    }
  }, [cdnService, timeRange]);

  const loadCacheStats = useCallback(() => {
    const stats = cdnService.getCacheStats();
    setCacheStats(stats);
  }, [cdnService]);

  useEffect(() => {
    loadAnalytics();
    loadCacheStats();
    
    // Refresh data every 30 seconds
    const interval = setInterval(() => {
      loadAnalytics();
      loadCacheStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [timeRange, loadAnalytics, loadCacheStats]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setSelectedFiles(files);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const assets = Array.from(files).map(file => ({
        file,
        path: `uploads/${file.name}`,
        options: {
          quality: 80,
          compress: true
        }
      }));

      const result = await cdnService.uploadAssets(assets);
      
      setUploadProgress(100);
      
      // Refresh analytics after upload
      setTimeout(() => {
        loadAnalytics();
        loadCacheStats();
        setIsUploading(false);
        setUploadProgress(0);
        setSelectedFiles(null);
      }, 1000);
      
      logger.debug('Upload completed:', 'deployment', { data: result });
    } catch (error) {
      logger.error('Upload failed:', 'components', {}, error as Error);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCacheInvalidation = async () => {
    if (!invalidationPaths.trim()) return;

    setIsInvalidating(true);
    
    try {
      const paths = invalidationPaths.split('\\n').map(p => p.trim()).filter(Boolean);
      await cdnService.invalidateCache(paths);
      setInvalidationPaths('');
      loadCacheStats();
    } catch (error) {
      logger.error('Cache invalidation failed:', 'components', {}, error as Error);
    } finally {
      setIsInvalidating(false);
    }
  };

  const performanceMetrics = useMemo(() => {
    if (!analytics) return null;

    return {
      avgResponseTime: analytics.averageResponseTime,
      hitRate: analytics.hitRate * 100,
      errorRate: analytics.errorRate * 100,
      bandwidth: analytics.bandwidth
    };
  }, [analytics]);

  const bandwidthSavings = useMemo(() => {
    if (!analytics || !cacheStats) return 0;
    return analytics.hitRate * analytics.bandwidth;
  }, [analytics, cacheStats]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">CDN Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor and manage content delivery network performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(value: AnalyticsTimeRange) => setTimeRange(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { loadAnalytics(); loadCacheStats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hit Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {performanceMetrics ? `${performanceMetrics.hitRate.toFixed(1)}%` : '--'}
            </div>
            <Progress value={performanceMetrics?.hitRate || 0} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Cache hit rate for {timeRange}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {performanceMetrics ? `${performanceMetrics.avgResponseTime}ms` : '--'}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Average response time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bandwidth Saved</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(bandwidthSavings)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Due to CDN caching
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {performanceMetrics ? `${performanceMetrics.errorRate.toFixed(2)}%` : '--'}
            </div>
            <Badge variant={performanceMetrics && performanceMetrics.errorRate < 1 ? "outline" : "destructive"}>
              {performanceMetrics && performanceMetrics.errorRate < 1 ? 'Good' : 'High'}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Request error rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="upload">Upload Assets</TabsTrigger>
          <TabsTrigger value="cache">Cache Management</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cache Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Cache Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cacheStats ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Entries</span>
                      <span className="text-sm">{cacheStats.totalEntries.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Hit Count</span>
                      <span className="text-sm">{cacheStats.hitCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Expired</span>
                      <span className="text-sm">{cacheStats.expiredCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Memory Usage</span>
                      <span className="text-sm">{formatBytes(cacheStats.memoryUsage)}</span>
                    </div>
                    <div className="pt-2">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Cache Efficiency</span>
                        <span className="text-sm">{(cacheStats.hitRate * 100).toFixed(1)}%</span>
                      </div>
                      <Progress value={cacheStats.hitRate * 100} />
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    Loading cache statistics...
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Assets */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Top Assets
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics?.topAssets && analytics.topAssets.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.topAssets.slice(0, 5).map((asset, index) => (
                      <div key={asset.path} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                          <span className="text-sm font-medium truncate">
                            {asset.path.split('/').pop()}
                          </span>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <div>{asset.requests.toLocaleString()} requests</div>
                          <div>{formatBytes(asset.bandwidth)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    No asset data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Assets
              </CardTitle>
              <CardDescription>
                Upload and optimize assets for CDN distribution
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="asset-upload">Select Files</Label>
                <Input 
                  id="asset-upload" 
                  type="file" 
                  multiple 
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </div>
              
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Uploading...</span>
                    <span className="text-sm">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                  {selectedFiles && (
                    <p className="text-xs text-muted-foreground">
                      Processing {selectedFiles.length} file(s)
                    </p>
                  )}
                </div>
              )}
              
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2">Upload Features</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Automatic image optimization and compression</li>
                  <li>• WebP/AVIF format conversion for better performance</li>
                  <li>• Global CDN distribution</li>
                  <li>• Automatic caching and versioning</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Cache Management
              </CardTitle>
              <CardDescription>
                Invalidate cached assets to force updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invalidation-paths">Asset Paths to Invalidate</Label>
                <textarea
                  id="invalidation-paths"
                  className="w-full h-24 px-3 py-2 text-sm border border-border rounded-md"
                  placeholder={`Enter asset paths, one per line:
/images/logo.png
/css/styles.css
/js/app.js`}
                  value={invalidationPaths}
                  onChange={(e) => setInvalidationPaths(e.target.value)}
                />
              </div>
              
              <Button 
                onClick={handleCacheInvalidation}
                disabled={isInvalidating || !invalidationPaths.trim()}
                className="w-full"
              >
                {isInvalidating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Invalidating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Invalidate Cache
                  </>
                )}
              </Button>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2">Cache Invalidation</h4>
                <p className="text-xs text-muted-foreground">
                  Invalidating cache forces the CDN to fetch fresh copies of assets. 
                  This process typically takes 5-15 minutes to propagate globally.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Geographic Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics?.geographicDistribution ? (
                <div className="space-y-3">
                  {Object.entries(analytics.geographicDistribution)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 10)
                    .map(([country, requests]) => (
                      <div key={country} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{country}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24">
                            <Progress 
                              value={(requests / Math.max(...Object.values(analytics.geographicDistribution))) * 100} 
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-16 text-right">
                            {requests.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No geographic data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};