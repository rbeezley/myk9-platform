import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Download, FileText, Database, Wifi, HardDrive } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import {
  OfflineModeBanner,
  SyncProgressIndicator,
  DataFreshnessBadge,
  ConnectionQualityMeter,
  StorageUsageMonitor,
  DataExportDialog,
  ReportGenerationDialog,
  DataManagementPanel,
  OfflineStatusBar
} from '../components/offline';
// import { DatabaseTestComponent } from '../components/test/DatabaseTestComponent';

export const OfflineTestPage: React.FC = () => {
  const [isOnline] = useState(navigator.onLine);
  const [lastSync] = useState(new Date(Date.now() - 10 * 60 * 1000)); // 10 minutes ago
  const [pendingChanges] = useState(5);

  const mockSyncStatus = {
    isActive: false,
    stage: 'complete' as const,
    progress: 100,
    message: 'All data synchronized',
    itemsProcessed: 25,
    totalItems: 25
  };

  return (
    <div className="container mx-auto pt-20 px-6 pb-6 max-w-6xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Test Dashboard</h1>
        <p className="text-muted-foreground">
          Database integration tests and Phase 4 advanced offline capabilities for MyK9Show
        </p>
      </div>

      {/* Database Testing */}
      {/* <DatabaseTestComponent /> */}

      {/* Status Components */}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              Offline Status Components
            </CardTitle>
            <CardDescription>
              Visual indicators for connection status and data freshness
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Offline Banner */}
            <div className="space-y-2">
              <h4 className="font-medium">Offline Mode Banner</h4>
              <OfflineModeBanner
                isOnline={isOnline}
                lastSyncTime={lastSync}
                pendingChanges={pendingChanges}
                onRetrySync={() => logger.debug('Retry sync', 'pages', {})}
              />
            </div>

            <Separator />

            {/* Status Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Connection Quality</h4>
                <ConnectionQualityMeter showDetails={true} />
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Data Freshness</h4>
                <div className="flex gap-2">
                  <DataFreshnessBadge
                    lastUpdated={lastSync}
                    isOnline={isOnline}
                    showLabel={true}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Sync Progress</h4>
                <SyncProgressIndicator
                  syncStatus={mockSyncStatus}
                  showDetails={true}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Storage Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Storage Management
            </CardTitle>
            <CardDescription>
              Monitor storage usage and manage local data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StorageUsageMonitor 
              showBreakdown={true}
              warningThreshold={70}
              criticalThreshold={90}
            />
          </CardContent>
        </Card>

        {/* Export and Reports */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Export
              </CardTitle>
              <CardDescription>
                Export data in multiple formats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Export your show data in CSV, JSON, Excel, or PDF formats
                </p>
                <DataExportDialog
                  trigger={
                    <Button className="gap-2">
                      <Download className="h-4 w-4" />
                      Export Data
                    </Button>
                  }
                />
              </div>
              
              <div className="space-y-2">
                <h4 className="font-sm font-medium">Supported Formats:</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">CSV</Badge>
                  <Badge variant="secondary">JSON</Badge>
                  <Badge variant="secondary">Excel</Badge>
                  <Badge variant="secondary">PDF</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Report Generation
              </CardTitle>
              <CardDescription>
                Generate professional show reports
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Create entry lists, judge books, results, and summary reports
                </p>
                <ReportGenerationDialog
                  showId="demo-show-123"
                  trigger={
                    <Button className="gap-2">
                      <FileText className="h-4 w-4" />
                      Generate Report
                    </Button>
                  }
                />
              </div>
              
              <div className="space-y-2">
                <h4 className="font-sm font-medium">Available Reports:</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Entry Lists</Badge>
                  <Badge variant="outline">Class Schedules</Badge>
                  <Badge variant="outline">Judge Books</Badge>
                  <Badge variant="outline">Results</Badge>
                  <Badge variant="outline">Summaries</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Complete Data Management Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Complete Data Management</CardTitle>
            <CardDescription>
              Full-featured data management panel with backup, export, reports, and cleanup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataManagementPanel />
          </CardContent>
        </Card>

        {/* Status Bar Integration */}
        <Card>
          <CardHeader>
            <CardTitle>Integrated Status Bar</CardTitle>
            <CardDescription>
              Complete offline status bar for the main application
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <OfflineStatusBar />
          </CardContent>
        </Card>
      </div>

      {/* Feature Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Phase 4 Features Summary</CardTitle>
          <CardDescription>
            Advanced offline capabilities implemented
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h4 className="font-medium">Export Features</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Multi-format export (CSV, JSON, Excel, PDF)</li>
                <li>• Selective entity export</li>
                <li>• Progress tracking & cancellation</li>
                <li>• Batch processing for large datasets</li>
                <li>• Metadata inclusion options</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Report Generation</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Entry lists with complete details</li>
                <li>• Class schedules & ring assignments</li>
                <li>• Judge books with forms</li>
                <li>• Results & placement lists</li>
                <li>• Show statistics & summaries</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Offline UI</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Connection quality indicators</li>
                <li>• Offline mode banners</li>
                <li>• Sync progress tracking</li>
                <li>• Data freshness badges</li>
                <li>• Storage usage monitoring</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Data Management</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Complete backup creation</li>
                <li>• Backup restoration</li>
                <li>• Data cleanup tools</li>
                <li>• Storage optimization</li>
                <li>• Archive management</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Performance</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Background processing</li>
                <li>• Memory-efficient streaming</li>
                <li>• Progress feedback</li>
                <li>• Cancellation support</li>
                <li>• Error handling & recovery</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Integration</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Works with existing stores</li>
                <li>• Sync service integration</li>
                <li>• UI component library</li>
                <li>• Background operations</li>
                <li>• Professional quality output</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};