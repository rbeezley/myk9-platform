/**
 * Scoring Demo Page
 * 
 * Comprehensive demonstration of all Phase 3 scoring sync UI components.
 * Shows live score updates, offline mode indicators, conflict handling,
 * judge sync dashboard, and placement alerts in action.
 */

import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import { motion } from 'framer-motion';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Phase 3 Scoring Components
import {
  LiveScoreUpdates,
  OfflineScoringModeIndicator,
  ScoringConflictHandler,
  JudgeSyncDashboard,
  PlacementRecalculationAlert
} from '@/components/scoring';

// Icons
import { 
  Trophy, 
  Users, 
  WifiOff, 
  BarChart3, 
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Database
} from 'lucide-react';

// Mock judge ID for demo
const DEMO_JUDGE_ID = 'judge-demo-001';
const DEMO_CLASS_ID = 'class-demo-scent-work';

/**
 * Demo page showcasing Phase 3 scoring sync components
 */
export function ScoringDemoPage() {
  const [demoMode, setDemoMode] = useState<'live' | 'offline' | 'conflict'>('live');
  const [isSimulating, setIsSimulating] = useState(false);

  // Simulate different scenarios
  const startSimulation = (mode: 'live' | 'offline' | 'conflict') => {
    setDemoMode(mode);
    setIsSimulating(true);
    
    // Auto-stop simulation after 30 seconds
    setTimeout(() => {
      setIsSimulating(false);
    }, 30000);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-20 pb-8 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                Scoring Sync Dashboard
              </h1>
              <p className="text-muted-foreground text-lg">
                Phase 3: Real-time scoring synchronization and conflict resolution
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm">
                Demo Mode
              </Badge>
              <Badge 
                variant={demoMode === 'live' ? 'default' : 'secondary'} 
                className="text-sm"
              >
                {demoMode === 'live' ? 'Live Scoring' : 
                 demoMode === 'offline' ? 'Offline Mode' : 
                 'Conflict Resolution'}
              </Badge>
            </div>
          </div>

          {/* Demo controls */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Database className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-medium">Demo Controls</h3>
                    <p className="text-xs text-muted-foreground">
                      Simulate different scoring scenarios
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={demoMode === 'live' ? 'default' : 'outline'}
                    onClick={() => startSimulation('live')}
                    disabled={isSimulating}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Live Mode
                  </Button>
                  <Button
                    size="sm"
                    variant={demoMode === 'offline' ? 'default' : 'outline'}
                    onClick={() => startSimulation('offline')}
                    disabled={isSimulating}
                  >
                    <WifiOff className="h-3 w-3 mr-1" />
                    Offline Mode
                  </Button>
                  <Button
                    size="sm"
                    variant={demoMode === 'conflict' ? 'default' : 'outline'}
                    onClick={() => startSimulation('conflict')}
                    disabled={isSimulating}
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Conflicts
                  </Button>
                  {isSimulating && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsSimulating(false)}
                    >
                      <Pause className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main content tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-3 w-3" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="live-scores" className="flex items-center gap-2">
              <Trophy className="h-3 w-3" />
              Live Scores
            </TabsTrigger>
            <TabsTrigger value="sync-status" className="flex items-center gap-2">
              <RotateCcw className="h-3 w-3" />
              Sync Status
            </TabsTrigger>
            <TabsTrigger value="conflicts" className="flex items-center gap-2">
              <Users className="h-3 w-3" />
              Conflicts
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Database className="h-3 w-3" />
              Dashboard
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Live Score Updates Preview */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Live Score Updates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <LiveScoreUpdates
                      classId={DEMO_CLASS_ID}
                      format="scent_work"
                      maxDisplayEntries={5}
                      onScoreSelect={(entryId) =>
                        logger.debug('Selected entry', 'scoring-demo', { entryId })
                      }
                    />
                  </CardContent>
                </Card>
              </motion.div>

              {/* Offline Mode Indicator */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <WifiOff className="h-4 w-4" />
                      Offline Mode Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OfflineScoringModeIndicator
                      showDetailedStatus={true}
                      showSyncQueue={true}
                      onRetrySync={() =>
                        logger.debug('Retrying sync', 'scoring-demo')
                      }
                    />
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Placement Alerts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Placement Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PlacementRecalculationAlert
                    classId={DEMO_CLASS_ID}
                    format="scent_work"
                    onDismiss={(alertId) =>
                      logger.debug('Dismissed alert', 'scoring-demo', { alertId })
                    }
                    onViewPlacements={() =>
                      logger.debug('Viewing placements', 'scoring-demo')
                    }
                  />
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* Live Scores Tab */}
          <TabsContent value="live-scores" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <LiveScoreUpdates
                classId={DEMO_CLASS_ID}
                format="scent_work"
                showOnlyQualified={false}
                maxDisplayEntries={15}
                onScoreSelect={(entryId) =>
                  logger.debug('Selected entry for detailed view', 'scoring-demo', { entryId })
                }
              />
            </motion.div>
          </TabsContent>

          {/* Sync Status Tab */}
          <TabsContent value="sync-status" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <OfflineScoringModeIndicator
                showDetailedStatus={true}
                showSyncQueue={true}
                onRetrySync={() => {
                  logger.debug('Manual sync triggered', 'scoring-demo');
                  // Simulate sync process
                }}
              />
            </motion.div>
          </TabsContent>

          {/* Conflicts Tab */}
          <TabsContent value="conflicts" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <ScoringConflictHandler
                classId={DEMO_CLASS_ID}
                format="scent_work"
                onConflictResolved={(entryId, resolution) => {
                  logger.debug('Conflict resolved', 'scoring-demo', { entryId, resolution });
                }}
                onViewScore={(entryId, judgeId) => {
                  logger.debug('Viewing score', 'scoring-demo', { entryId, judgeId });
                }}
              />
            </motion.div>
          </TabsContent>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <JudgeSyncDashboard
                judgeId={DEMO_JUDGE_ID}
                classId={DEMO_CLASS_ID}
                format="scent_work"
                onForceSync={() => {
                  logger.debug('Force sync initiated by judge', 'scoring-demo');
                }}
                onDataExport={() => {
                  logger.debug('Exporting judge data', 'scoring-demo');
                }}
              />
            </motion.div>
          </TabsContent>
        </Tabs>

        {/* Component Features Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12"
        >
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">Phase 3 Components Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">LiveScoreUpdates</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Real-time score display</li>
                    <li>• Sync status indicators</li>
                    <li>• Placement tracking</li>
                    <li>• Multi-format support</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">OfflineScoringModeIndicator</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Connection monitoring</li>
                    <li>• Storage usage tracking</li>
                    <li>• Sync queue management</li>
                    <li>• Offline capabilities display</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">ScoringConflictHandler</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Multi-judge conflict detection</li>
                    <li>• Resolution workflow</li>
                    <li>• Strategy selection</li>
                    <li>• Audit trail</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">JudgeSyncDashboard</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Comprehensive sync monitoring</li>
                    <li>• Performance metrics</li>
                    <li>• Data integrity checks</li>
                    <li>• Manual sync controls</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">PlacementRecalculationAlert</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Placement change notifications</li>
                    <li>• Priority-based alerts</li>
                    <li>• Change visualization</li>
                    <li>• Auto-dismiss timers</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Integration Features</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Apple-inspired design</li>
                    <li>• Framer Motion animations</li>
                    <li>• Real-time event handling</li>
                    <li>• Performance optimization</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

export default ScoringDemoPage;