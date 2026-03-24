/**
 * Performance Mode Toggle for Admin
 *
 * Allows administrators to switch between development and production storage modes
 * for testing performance optimizations in a production-like environment.
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/services/LoggingService';
import {
  Settings,
  Zap,
  Database,
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  storageAdapterFactory,
  getStorageAdapterInfo,
} from '@/services/database/storage-adapter-factory';
import { getConnectionStats } from '@/services/database/connection-pool';
import type { ConnectionStats } from '@/services/database/connection-pool';
import { getCompressionStats } from '@/services/database/compression-utils';

interface PerformanceSettings {
  storageMode: 'development' | 'production' | 'optimized';
  enableMetrics: boolean;
  enableCompression: boolean;
  enableConnectionPooling: boolean;
}

// Helper function to load stats
function loadStatsData(): {
  storage: { type?: string; enableMetrics?: boolean; [key: string]: unknown };
  connection: ConnectionStats;
  compression: { avgCompressionRatio: number; cacheSize: number; config: unknown };
} | null {
  try {
    return {
      storage: getStorageAdapterInfo(),
      connection: getConnectionStats(),
      compression: getCompressionStats(),
    };
  } catch (error) {
    logger.warn('Could not load performance stats:', 'admin', {}, error as Error);
    return null;
  }
}

export const PerformanceModeToggle: React.FC = () => {
  const [isApplying, setIsApplying] = useState(false);

  // Use lazy initial state to load stats on first render
  const [stats, setStats] = useState<{
    storage: { type?: string; enableMetrics?: boolean; [key: string]: unknown };
    connection: ConnectionStats;
    compression: { avgCompressionRatio: number; cacheSize: number; config: unknown };
  } | null>(() => loadStatsData());

  const loadStats = useCallback(() => {
    const newStats = loadStatsData();
    if (newStats) {
      setStats(newStats);
    }
  }, []);

  // Initialize settings from storage (lazy initial state)
  const [settings, setSettings] = useState<PerformanceSettings>(() => {
    const currentInfo = getStorageAdapterInfo();
    const savedMode = localStorage.getItem('admin-storage-mode') as
      | 'development'
      | 'production'
      | 'optimized'
      | null;
    return {
      storageMode: savedMode || (import.meta.env.DEV ? 'development' : 'production'),
      enableMetrics: currentInfo.enableMetrics,
      enableCompression: localStorage.getItem('admin-enable-compression') === 'true',
      enableConnectionPooling: localStorage.getItem('admin-enable-pooling') !== 'false',
    };
  });

  const handleModeChange = (mode: 'development' | 'production' | 'optimized') => {
    setSettings(prev => ({ ...prev, storageMode: mode }));
  };

  const handleToggleChange = (
    key: keyof Omit<PerformanceSettings, 'storageMode'>,
    value: boolean
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const applySettings = async () => {
    setIsApplying(true);

    try {
      // Save settings to localStorage
      localStorage.setItem('admin-storage-mode', settings.storageMode);
      localStorage.setItem('admin-enable-compression', settings.enableCompression.toString());
      localStorage.setItem('admin-enable-pooling', settings.enableConnectionPooling.toString());
      localStorage.setItem('admin-enable-metrics', settings.enableMetrics.toString());

      // Configure storage adapter
      storageAdapterFactory.setConfig({
        type:
          settings.storageMode === 'development'
            ? 'development'
            : settings.storageMode === 'production'
              ? 'basic'
              : 'optimized',
        enableMetrics: settings.enableMetrics,
        forceBasicInProduction: settings.storageMode === 'production',
      });

      // Show success message and offer to reload
      setTimeout(() => {
        setIsApplying(false);
        if (confirm('Settings applied! Reload the page to see changes?')) {
          window.location.reload();
        }
      }, 1000);
    } catch (error) {
      logger.error('Failed to apply settings:', 'admin', {}, error as Error);
      setIsApplying(false);
    }
  };

  const resetToDefaults = () => {
    const defaultMode = import.meta.env.DEV ? 'development' : 'production';
    setSettings({
      storageMode: defaultMode,
      enableMetrics: import.meta.env.DEV,
      enableCompression: false,
      enableConnectionPooling: true,
    });
  };

  const getModeDescription = (mode: string) => {
    switch (mode) {
      case 'development':
        return 'Fast startup, in-memory storage with localStorage fallback. Best for development.';
      case 'production':
        return 'Basic IndexedDB adapter, optimized for reliability. Best for production.';
      case 'optimized':
        return 'Advanced features with compression and caching. Best for power users.';
      default:
        return '';
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'development':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'production':
        return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'optimized':
        return 'bg-violet-100 text-violet-800 border-violet-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen pt-8 pb-8 px-6 max-w-[90rem] mx-auto">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Performance Mode Configuration</h1>
          <p className="text-muted-foreground text-lg">
            Manage storage adapter modes and performance settings for optimal application
            performance
          </p>
        </div>

        {/* Performance Statistics */}
        {stats && (
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2 group-hover:text-primary transition-colors duration-300">
                <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                Performance Statistics
                <Button
                  onClick={loadStats}
                  variant="ghost"
                  size="sm"
                  className="ml-auto hover:bg-primary/10 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="group relative overflow-hidden p-6 bg-muted/50 rounded-2xl border border-border transition-all duration-500 hover:shadow-lg hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-2">
                      Storage Adapter
                    </h4>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">
                      {stats.storage.type as string}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Metrics: {stats.storage.enableMetrics ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>

                <div className="group relative overflow-hidden p-6 bg-muted/50 rounded-2xl border border-border transition-all duration-500 hover:shadow-lg hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-2">
                      Connections
                    </h4>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">
                      {stats.connection.totalConnections}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Active: {stats.connection.activeConnections}
                    </p>
                  </div>
                </div>

                <div className="group relative overflow-hidden p-6 bg-muted/50 rounded-2xl border border-border transition-all duration-500 hover:shadow-lg hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-2">
                      Compression
                    </h4>
                    <p className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">
                      {(stats.compression.avgCompressionRatio * 100).toFixed(1)}%
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Cache: {stats.compression.cacheSize} items
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2 group-hover:text-primary transition-colors duration-300">
              <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              Storage Adapter Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="relative space-y-6">
            {/* Current Status */}
            <div className="flex items-center justify-between p-6 bg-muted/50 rounded-xl border border-border">
              <div>
                <h3 className="font-medium">Current Mode</h3>
                <p className="text-sm text-muted-foreground">
                  Active since: {new Date().toLocaleString()}
                </p>
              </div>
              <Badge className={getModeColor((stats?.storage?.type as string) || 'unknown')}>
                {((stats?.storage?.type as string) || 'Unknown').toUpperCase()}
              </Badge>
            </div>

            {/* Storage Mode Selection */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg flex items-center justify-center">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                Storage Adapter Mode
              </h3>

              <div className="grid gap-4">
                {['development', 'production', 'optimized'].map(mode => (
                  <div
                    key={mode}
                    className={`group relative overflow-hidden p-6 border rounded-2xl cursor-pointer transition-all duration-500 hover:shadow-lg hover:-translate-y-1 ${
                      settings.storageMode === mode
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
                    }`}
                    onClick={() =>
                      handleModeChange(mode as 'development' | 'production' | 'optimized')
                    }
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${
                            mode === 'development'
                              ? 'bg-gradient-to-br from-blue-500/20 to-blue-400/10 shadow-lg'
                              : mode === 'production'
                                ? 'bg-gradient-to-br from-teal-500/20 to-teal-400/10 shadow-lg'
                                : 'bg-gradient-to-br from-violet-500/20 to-violet-400/10 shadow-lg'
                          }`}
                        >
                          {mode === 'development' && <Zap className="h-6 w-6 text-blue-500" />}
                          {mode === 'production' && (
                            <CheckCircle2 className="h-6 w-6 text-teal-500" />
                          )}
                          {mode === 'optimized' && <Activity className="h-6 w-6 text-violet-500" />}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold capitalize text-lg">{mode} Mode</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getModeDescription(mode)}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <div
                          className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                            settings.storageMode === mode
                              ? 'bg-primary border-primary shadow-lg shadow-primary/25'
                              : 'border-muted-foreground group-hover:border-primary/50'
                          }`}
                        >
                          {settings.storageMode === mode && (
                            <div className="w-full h-full rounded-full bg-card/20 animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg flex items-center justify-center">
                  <Settings className="h-4 w-4 text-primary" />
                </div>
                Advanced Settings
              </h3>

              <div className="grid gap-6">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-500/20 to-teal-400/10 rounded-lg flex items-center justify-center">
                      <Activity className="h-4 w-4 text-teal-500" />
                    </div>
                    <div>
                      <span className="font-medium">Performance Metrics</span>
                      <p className="text-sm text-muted-foreground">
                        Track query times and performance stats
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.enableMetrics}
                    onCheckedChange={checked => handleToggleChange('enableMetrics', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-500/20 to-orange-400/10 rounded-lg flex items-center justify-center">
                      <Database className="h-4 w-4 text-orange-500" />
                    </div>
                    <div>
                      <span className="font-medium">Data Compression</span>
                      <p className="text-sm text-muted-foreground">
                        Compress large data to save storage space
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.enableCompression}
                    onCheckedChange={checked => handleToggleChange('enableCompression', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500/20 to-blue-400/10 rounded-lg flex items-center justify-center">
                      <Activity className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <span className="font-medium">Connection Pooling</span>
                      <p className="text-sm text-muted-foreground">
                        Optimize database connections for performance
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.enableConnectionPooling}
                    onCheckedChange={checked =>
                      handleToggleChange('enableConnectionPooling', checked)
                    }
                  />
                </div>
              </div>
            </div>

            {/* Warning for Production Testing */}
            {!import.meta.env.DEV && settings.storageMode === 'development' && (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <div className="w-5 h-5 bg-gradient-to-br from-amber-500/20 to-amber-400/10 rounded flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </div>
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <strong>Warning:</strong> Development mode is active in production. This may
                  impact performance and data persistence. Use for testing only.
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 pt-2">
              <Button onClick={applySettings} disabled={isApplying} className="flex-1">
                {isApplying && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                {isApplying ? 'Applying...' : 'Apply Settings'}
              </Button>

              <Button
                onClick={resetToDefaults}
                variant="outline"
                className="!border-white/10 !bg-card/5 hover:!bg-card/10 !transition-all !duration-300 text-muted-foreground hover:text-foreground"
              >
                Reset to Defaults
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
