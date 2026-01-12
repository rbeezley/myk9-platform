import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/services/LoggingService';
import {
  Users, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Database,
  RefreshCcw,
  AlertCircle,
  Eye,
  FileText
} from 'lucide-react';
// import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useShowStore } from '@/store/showStore';

interface EntryCountReconciliationProps {
  /** Show ID to filter entries for specific show */
  showId?: string;
  /** Custom className */
  className?: string;
}

interface EntryDiscrepancy {
  id: string;
  className: string;
  trialName: string;
  showName: string;
  localCount: number;
  remoteCount: number;
  discrepancy: number;
  lastSyncAt?: Date;
  conflictType: 'missing_local' | 'missing_remote' | 'duplicate' | 'data_mismatch';
  details?: string;
  canAutoResolve: boolean;
}

interface ReconciliationSummary {
  totalClasses: number;
  classesWithDiscrepancies: number;
  totalLocalEntries: number;
  totalRemoteEntries: number;
  totalDiscrepancy: number;
  lastReconciliationAt?: Date;
}

/**
 * EntryCountReconciliation - Monitor and resolve entry count discrepancies
 * 
 * Provides comprehensive monitoring of entry counts between local and remote sources,
 * with tools for identifying and resolving discrepancies automatically or manually.
 */
export const EntryCountReconciliation: React.FC<EntryCountReconciliationProps> = ({
  showId,
  className = ''
}) => {
  const [discrepancies, setDiscrepancies] = useState<EntryDiscrepancy[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);

  const { shows } = useShowStore();

  // Load discrepancy data
  useEffect(() => {
    const loadDiscrepancies = () => {
      // Mock data - replace with actual API calls
      const mockDiscrepancies: EntryDiscrepancy[] = [
        {
          id: 'disc-1',
          className: 'Novice A',
          trialName: 'Obedience Trial 1',
          showName: 'Spring Classic Dog Show',
          localCount: 24,
          remoteCount: 22,
          discrepancy: 2,
          lastSyncAt: new Date(Date.now() - 600000), // 10 minutes ago
          conflictType: 'missing_remote',
          details: '2 entries added locally but not synced to remote',
          canAutoResolve: true
        },
        {
          id: 'disc-2',
          className: 'Open B',
          trialName: 'Obedience Trial 1',
          showName: 'Spring Classic Dog Show',
          localCount: 15,
          remoteCount: 18,
          discrepancy: -3,
          lastSyncAt: new Date(Date.now() - 900000), // 15 minutes ago
          conflictType: 'missing_local',
          details: '3 entries exist remotely but missing locally',
          canAutoResolve: false
        },
        {
          id: 'disc-3',
          className: 'Utility A',
          trialName: 'Obedience Trial 2',
          showName: 'Spring Classic Dog Show',
          localCount: 12,
          remoteCount: 14,
          discrepancy: -2,
          lastSyncAt: new Date(Date.now() - 1200000), // 20 minutes ago
          conflictType: 'data_mismatch',
          details: 'Conflicting entry data detected',
          canAutoResolve: false
        }
      ];

      // Filter by show if specified
      const filteredDiscrepancies = showId 
        ? mockDiscrepancies.filter(d => d.showName === shows.find(s => s.id === showId)?.name)
        : mockDiscrepancies;

      setDiscrepancies(filteredDiscrepancies);

      // Calculate summary
      const mockSummary: ReconciliationSummary = {
        totalClasses: 25,
        classesWithDiscrepancies: filteredDiscrepancies.length,
        totalLocalEntries: 287,
        totalRemoteEntries: 291,
        totalDiscrepancy: 4,
        lastReconciliationAt: new Date(Date.now() - 300000) // 5 minutes ago
      };

      setSummary(mockSummary);
    };

    loadDiscrepancies();
  }, [showId, shows]);

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      // Simulate reconciliation process
      await new Promise(resolve => setTimeout(resolve, 2000));
      // In real implementation, call reconciliation API
      logger.debug('Starting entry count reconciliation...', 'sync', {});
    } finally {
      setIsReconciling(false);
    }
  };

  const handleAutoResolve = async (discrepancyId: string) => {
    const discrepancy = discrepancies.find(d => d.id === discrepancyId);
    if (!discrepancy?.canAutoResolve) return;

    logger.debug('Auto-resolving discrepancy:', 'sync', { data: discrepancyId });
    // Remove from list after resolution
    setDiscrepancies(prev => prev.filter(d => d.id !== discrepancyId));
  };

  const getConflictTypeLabel = (type: EntryDiscrepancy['conflictType']): string => {
    switch (type) {
      case 'missing_local': return 'Missing Local';
      case 'missing_remote': return 'Missing Remote';
      case 'duplicate': return 'Duplicate';
      case 'data_mismatch': return 'Data Mismatch';
      default: return 'Unknown';
    }
  };

  const getConflictTypeColor = (type: EntryDiscrepancy['conflictType']): string => {
    switch (type) {
      case 'missing_local': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'missing_remote': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'duplicate': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'data_mismatch': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatLastReconciliation = (date?: Date): string => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Entry Count Reconciliation</h3>
          <p className="text-sm text-muted-foreground">
            Monitor and resolve discrepancies between local and remote entry counts
          </p>
        </div>
        <Button
          onClick={handleReconcile}
          disabled={isReconciling}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg 
                     hover:-translate-y-0.5 transition-all duration-200"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isReconciling ? 'animate-spin' : ''}`} />
          {isReconciling ? 'Reconciling...' : 'Reconcile Now'}
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm hover:shadow-md 
                           hover:-translate-y-0.5 transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Total Classes</p>
                  <p className="text-2xl font-bold">{summary.totalClasses}</p>
                </div>
                <Database className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm hover:shadow-md 
                           hover:-translate-y-0.5 transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">With Issues</p>
                  <p className="text-2xl font-bold text-orange-600">{summary.classesWithDiscrepancies}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm hover:shadow-md 
                           hover:-translate-y-0.5 transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Local Entries</p>
                  <p className="text-2xl font-bold text-green-600">{summary.totalLocalEntries}</p>
                </div>
                <Users className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm hover:shadow-md 
                           hover:-translate-y-0.5 transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Remote Entries</p>
                  <p className="text-2xl font-bold text-blue-600">{summary.totalRemoteEntries}</p>
                </div>
                <RefreshCcw className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reconciliation Status */}
      {summary && (
        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Reconciliation Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Accuracy</span>
              <span className="font-medium">
                {summary.totalClasses > 0 
                  ? Math.round(((summary.totalClasses - summary.classesWithDiscrepancies) / summary.totalClasses) * 100)
                  : 100
                }%
              </span>
            </div>
            <Progress 
              value={summary.totalClasses > 0 
                ? ((summary.totalClasses - summary.classesWithDiscrepancies) / summary.totalClasses) * 100
                : 100
              } 
              className="h-2" 
            />
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>
                {summary.totalClasses - summary.classesWithDiscrepancies} of {summary.totalClasses} classes match
              </span>
              <span>
                Last check: {formatLastReconciliation(summary.lastReconciliationAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Discrepancies List */}
      <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Entry Count Discrepancies ({discrepancies.length})</span>
            {discrepancies.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                Needs Attention
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {discrepancies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600 opacity-50" />
              <h4 className="font-medium mb-2">All Entry Counts Match</h4>
              <p className="text-sm">No discrepancies detected between local and remote entries</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {discrepancies.map((discrepancy) => (
                  <div
                    key={discrepancy.id}
                    className="p-4 bg-muted/30 rounded-lg border border-border/50 
                               hover:border-border transition-all duration-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <h4 className="font-medium">{discrepancy.className}</h4>
                        <p className="text-sm text-muted-foreground">
                          {discrepancy.trialName} • {discrepancy.showName}
                        </p>
                      </div>
                      <Badge 
                        className={`text-xs px-2 py-1 rounded-full border ${getConflictTypeColor(discrepancy.conflictType)}`}
                      >
                        {getConflictTypeLabel(discrepancy.conflictType)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                      <div className="flex items-center justify-between p-3 bg-green-50 
                                      rounded border border-green-200">
                        <span className="text-sm font-medium text-green-700">Local Count</span>
                        <span className="text-lg font-bold text-green-700">{discrepancy.localCount}</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-blue-50 
                                      rounded border border-blue-200">
                        <span className="text-sm font-medium text-blue-700">Remote Count</span>
                        <span className="text-lg font-bold text-blue-700">{discrepancy.remoteCount}</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-red-50 
                                      rounded border border-red-200">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-red-700">Difference</span>
                          {discrepancy.discrepancy > 0 ? (
                            <TrendingUp className="h-4 w-4 text-red-700" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-700" />
                          )}
                        </div>
                        <span className="text-lg font-bold text-red-700">
                          {discrepancy.discrepancy > 0 ? '+' : ''}{discrepancy.discrepancy}
                        </span>
                      </div>
                    </div>

                    {discrepancy.details && (
                      <Alert className="mb-3">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{discrepancy.details}</AlertDescription>
                      </Alert>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Last sync: {discrepancy.lastSyncAt 
                          ? formatLastReconciliation(discrepancy.lastSyncAt)
                          : 'Never'
                        }
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => logger.debug('View details for:', 'sync', { id: discrepancy.id })}
                          className="gap-2"
                        >
                          <Eye className="h-3 w-3" />
                          Details
                        </Button>
                        
                        {discrepancy.canAutoResolve && (
                          <Button
                            size="sm"
                            onClick={() => handleAutoResolve(discrepancy.id)}
                            className="gap-2 bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Auto Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Reconciliation Tips */}
      <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Reconciliation Tips
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-600 mt-2 flex-shrink-0" />
            <div>
              <strong>Missing Remote:</strong> Entries exist locally but haven't synced to the remote server. 
              Usually caused by network issues or sync failures.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-orange-600 mt-2 flex-shrink-0" />
            <div>
              <strong>Missing Local:</strong> Entries exist on the remote server but not locally. 
              May indicate data loss or incomplete downloads.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-red-600 mt-2 flex-shrink-0" />
            <div>
              <strong>Data Mismatch:</strong> Conflicting information between local and remote entries. 
              Requires manual review to determine correct data.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EntryCountReconciliation;