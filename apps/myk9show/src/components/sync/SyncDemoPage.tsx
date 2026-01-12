import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logger } from '@/services/LoggingService';
import {
  RefreshCw, 
  Database, 
  Activity,
  Settings
} from 'lucide-react';
import { 
  ShowSyncDashboard,
  SyncStatusIndicator,
  ClassSyncStatus,
  EntryCountReconciliation,
  ScheduleConflictAlerts
} from './index';

/**
 * SyncDemoPage - Demonstration page showcasing all Phase 3 sync components
 * 
 * This component demonstrates the comprehensive sync UI system with Apple-inspired design,
 * real-time updates, and interactive controls for managing show synchronization.
 */
const SyncDemoPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        {/* Header */}
        <div className="space-y-8 mb-12">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full">
                <RefreshCw className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight">
                Phase 3 RefreshCw System
              </h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Comprehensive show synchronization with Apple-inspired design, real-time updates, 
              and intelligent conflict resolution for seamless dog show management.
            </p>
            <div className="flex items-center justify-center gap-4 pt-4">
              <Badge className="bg-green-100 text-green-700 border-green-200 px-3 py-1">
                <Activity className="h-3 w-3 mr-1" />
                Real-time Updates
              </Badge>
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 px-3 py-1">
                <Database className="h-3 w-3 mr-1" />
                Local-First Architecture
              </Badge>
              <Badge className="bg-purple-100 text-purple-700 border-purple-200 px-3 py-1">
                <Settings className="h-3 w-3 mr-1" />
                Auto-Resolution
              </Badge>
            </div>
          </div>
        </div>

        {/* Component Showcase */}
        <Tabs defaultValue="dashboard" className="space-y-8">
          <TabsList className="grid w-full grid-cols-5 bg-muted/50 backdrop-blur-sm">
            <TabsTrigger 
              value="dashboard"
              className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 
                         data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              Main Dashboard
            </TabsTrigger>
            <TabsTrigger 
              value="indicators"
              className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 
                         data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              Status Indicators
            </TabsTrigger>
            <TabsTrigger 
              value="classes"
              className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 
                         data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              Class Status
            </TabsTrigger>
            <TabsTrigger 
              value="reconciliation"
              className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 
                         data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              Entry Reconciliation
            </TabsTrigger>
            <TabsTrigger 
              value="conflicts"
              className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 
                         data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              Schedule Conflicts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Show RefreshCw Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ShowSyncDashboard 
                  realTimeUpdates={true}
                  className="border-0"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="indicators" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">RefreshCw Status Examples</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">Show RefreshCwed</span>
                    <SyncStatusIndicator status="synced" entityType="show" showLabel />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">Pending RefreshCw</span>
                    <SyncStatusIndicator status="pending" entityType="class" showLabel />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">RefreshCw Error</span>
                    <SyncStatusIndicator 
                      status="error" 
                      entityType="entry" 
                      showLabel 
                      errorMessage="Network timeout"
                      enableActions
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">Conflict Detected</span>
                    <SyncStatusIndicator status="conflict" entityType="trial" showLabel enableActions />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Compact Indicators</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">Compact RefreshCwed</span>
                    <SyncStatusIndicator status="synced" compact />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">Compact Pending</span>
                    <SyncStatusIndicator status="pending" compact />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">Compact Error</span>
                    <SyncStatusIndicator status="error" compact errorMessage="RefreshCw failed" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">Offline Status</span>
                    <SyncStatusIndicator status="offline" compact />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Interactive Features</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">With Tooltip</span>
                      <SyncStatusIndicator 
                        status="error" 
                        entityType="show" 
                        entityId="show-123"
                        lastSyncAt={new Date(Date.now() - 300000)}
                        errorMessage="Network connection lost"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Hover to see detailed sync information
                    </p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">With Actions</span>
                      <SyncStatusIndicator 
                        status="conflict" 
                        entityType="class" 
                        entityId="class-456"
                        enableActions
                        onRetry={() => logger.debug('Retry triggered', 'sync', {});}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Click retry button to resolve conflicts
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="classes">
            <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Class RefreshCw Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ClassSyncStatus />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reconciliation">
            <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Entry Count Reconciliation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EntryCountReconciliation />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conflicts">
            <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Schedule Conflict Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScheduleConflictAlerts />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Features Summary */}
        <div className="mt-16 space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Key Features</h2>
            <p className="text-muted-foreground">
              Built with Apple's design principles and modern web technologies
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm hover:shadow-md 
                             hover:-translate-y-0.5 transition-all duration-300">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <RefreshCw className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold mb-2">Real-time RefreshCw</h3>
                <p className="text-sm text-muted-foreground">
                  Live updates and progress monitoring
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm hover:shadow-md 
                             hover:-translate-y-0.5 transition-all duration-300">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Activity className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold mb-2">Auto Resolution</h3>
                <p className="text-sm text-muted-foreground">
                  Intelligent conflict detection and resolution
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm hover:shadow-md 
                             hover:-translate-y-0.5 transition-all duration-300">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Database className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-semibold mb-2">Data Integrity</h3>
                <p className="text-sm text-muted-foreground">
                  Entry count reconciliation and validation
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm hover:shadow-md 
                             hover:-translate-y-0.5 transition-all duration-300">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Settings className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="font-semibold mb-2">Schedule Management</h3>
                <p className="text-sm text-muted-foreground">
                  Conflict detection and resolution suggestions
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncDemoPage;