/**
 * Gate Steward Interface
 *
 * Enhanced interface for gate stewards with offline-first check-in support,
 * QR scanning, and comprehensive conflict resolution.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
// import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckInStatus, requiresAction } from '@/types/check-in-types';
import {
  CheckInStatusIndicator,
  CheckInQuickActions,
} from '@/components/common/CheckInStatusIndicator';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { OfflineCheckInInterface } from '@/components/offline-checkin/OfflineCheckInInterface';
import { useAuthContext } from '@/hooks/useAuthContext';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import {
  Search,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  QrCode,
  Wifi,
  WifiOff,
} from 'lucide-react';

// Offline check-in services
import { offlineCheckInService } from '@/services/offline-checkin/OfflineCheckInService';
import { gateCoordinator } from '@/services/offline-checkin/GateCoordinator';
import type { CheckInStatistics } from '@/types/offline-checkin-types';
import { cn } from '@/lib/utils';

interface GateEntry {
  id: string;
  entryNumber: string;
  armband: string;
  dogName: string;
  handlerName: string;
  ownerName: string;
  className: string;
  classNumber: string;
  ring: string;
  checkInStatus: CheckInStatus;
  checkInTime?: Date;
  runOrder?: number;
  estimatedRunTime?: Date;
  judgeAssigned: string;
  isUrgent?: boolean;
}

interface GateStewardInterfaceProps {
  assignedRings?: string[];
  className?: string;
  gateId?: string;
  showId?: string;
}

export const GateStewardInterface: React.FC<GateStewardInterfaceProps> = ({
  assignedRings = ['1', '2', '3', '4'],
  className,
  gateId = 'gate-1',
  showId = 'current-show',
}) => {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<GateEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CheckInStatus | 'all'>('all');
  const [ringFilter, setRingFilter] = useState<string>('all');
  const [selectedTab, setSelectedTab] = useState('needs-attention');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInDialog, setCheckInDialog] = useState<{
    open: boolean;
    entry: GateEntry | null;
  }>({ open: false, entry: null });

  // Offline check-in state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // const [offlineMode, setOfflineMode] = useState(false);
  const [showOfflineInterface, setShowOfflineInterface] = useState(false);
  const [offlineStats, setOfflineStats] = useState<CheckInStatistics | null>(null);
  const [servicesInitialized, setServicesInitialized] = useState(false);

  const loadOfflineStats = useCallback(async () => {
    if (servicesInitialized) {
      try {
        const stats = await offlineCheckInService.getStatistics();
        setOfflineStats(stats);
      } catch (error) {
        logger.error('Failed to load offline stats', 'steward', {}, error as Error);
      }
    }
  }, [servicesInitialized]);

  const loadGateEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      // Mock data representing entries across multiple rings
      const mockEntries: GateEntry[] = [
        {
          id: 'entry_1',
          entryNumber: 'E001',
          armband: '101',
          dogName: 'Bella',
          handlerName: 'Sarah Johnson',
          ownerName: 'Sarah Johnson',
          className: 'Open Standard',
          classNumber: '15',
          ring: '1',
          checkInStatus: 'go-to-gate',
          runOrder: 1,
          estimatedRunTime: new Date(2024, 6, 15, 9, 0),
          judgeAssigned: 'Judge Smith',
          isUrgent: true,
        },
        {
          id: 'entry_2',
          entryNumber: 'E002',
          armband: '102',
          dogName: 'Max',
          handlerName: 'John Davis',
          ownerName: 'John Davis',
          className: 'Open JWW',
          classNumber: '16',
          ring: '1',
          checkInStatus: 'checked-in',
          runOrder: 2,
          estimatedRunTime: new Date(2024, 6, 15, 9, 10),
          judgeAssigned: 'Judge Smith',
          isUrgent: false,
        },
        {
          id: 'entry_3',
          entryNumber: 'E003',
          armband: '103',
          dogName: 'Luna',
          handlerName: 'Emily Wilson',
          ownerName: 'Emily Wilson',
          className: 'Open FAST',
          classNumber: '17',
          ring: '2',
          checkInStatus: 'at-gate',
          runOrder: 1,
          estimatedRunTime: new Date(2024, 6, 15, 9, 0),
          judgeAssigned: 'Judge Brown',
          isUrgent: false,
        },
        {
          id: 'entry_4',
          entryNumber: 'E004',
          armband: '104',
          dogName: 'Charlie',
          handlerName: 'Mike Thompson',
          ownerName: 'Mike Thompson',
          className: 'Open Standard',
          classNumber: '15',
          ring: '1',
          checkInStatus: 'conflict',
          runOrder: 3,
          estimatedRunTime: new Date(2024, 6, 15, 9, 15),
          judgeAssigned: 'Judge Smith',
          isUrgent: true,
        },
        {
          id: 'entry_5',
          entryNumber: 'E005',
          armband: '105',
          dogName: 'Bailey',
          handlerName: 'Lisa Miller',
          ownerName: 'Lisa Miller',
          className: 'Open JWW',
          classNumber: '18',
          ring: '2',
          checkInStatus: 'at-gate',
          runOrder: 8,
          estimatedRunTime: new Date(2024, 6, 15, 9, 20),
          judgeAssigned: 'Judge Davis',
          isUrgent: false,
        },
      ];

      setEntries(mockEntries);
    } catch (error) {
      logger.error('Failed to load gate entries', 'steward', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const initializeOfflineServices = useCallback(async () => {
    try {
      await Promise.all([offlineCheckInService.initialize(), gateCoordinator.initialize()]);

      setServicesInitialized(true);
      await loadOfflineStats();
    } catch (error) {
      logger.error('Failed to initialize offline services', 'steward', {}, error as Error);
    }
  }, [loadOfflineStats]);

  const handleOfflineCheckInEvent = useCallback(
    (event: unknown) => {
      logger.debug('Offline check-in event', 'steward', { event });
      if ((event as { type: string }).type === 'check_in_completed') {
        loadGateEntries();
        loadOfflineStats();
      }
    },
    [loadGateEntries, loadOfflineStats]
  );

  const handleGateEvent = (event: unknown) => {
    logger.debug('Gate event', 'steward', { event });
  };

  const setupEventListeners = useCallback(() => {
    offlineCheckInService.on('checkin-event', handleOfflineCheckInEvent);
    gateCoordinator.on('gate-event', handleGateEvent);
  }, [handleOfflineCheckInEvent]);

  useEffect(() => {
    initializeOfflineServices();
    loadGateEntries();
    setupEventListeners();

    return () => {
      cleanupServices();
    };
  }, [assignedRings, initializeOfflineServices, setupEventListeners, loadGateEntries]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const cleanupServices = async () => {
    try {
      offlineCheckInService.removeAllListeners();
      gateCoordinator.removeAllListeners();
    } catch (error) {
      logger.error('Cleanup failed', 'steward', {}, error as Error);
    }
  };

  const applyFilters = useCallback(() => {
    let filtered = [...entries];

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        entry =>
          entry.dogName.toLowerCase().includes(searchLower) ||
          entry.handlerName.toLowerCase().includes(searchLower) ||
          entry.armband.includes(searchLower) ||
          entry.entryNumber.toLowerCase().includes(searchLower) ||
          entry.ring.includes(searchLower)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => entry.checkInStatus === statusFilter);
    }

    // Ring filter
    if (ringFilter !== 'all') {
      filtered = filtered.filter(entry => entry.ring === ringFilter);
    }

    // Tab filter
    switch (selectedTab) {
      case 'needs-attention':
        filtered = filtered.filter(
          entry =>
            requiresAction(entry.checkInStatus) || entry.checkInStatus === 'none' || entry.isUrgent
        );
        break;
      case 'at-gate':
        filtered = filtered.filter(
          entry => entry.checkInStatus === 'at-gate' || entry.checkInStatus === 'go-to-gate'
        );
        break;
      case 'conflicts':
        filtered = filtered.filter(entry => entry.checkInStatus === 'conflict');
        break;
      case 'ready':
        filtered = filtered.filter(entry => entry.checkInStatus === 'checked-in');
        break;
      default:
        // 'all' - no additional filtering
        break;
    }

    // Sort by urgency, then ring, then run order
    filtered.sort((a, b) => {
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      if (a.ring !== b.ring) return a.ring.localeCompare(b.ring);
      return (a.runOrder || 999) - (b.runOrder || 999);
    });

    setFilteredEntries(filtered);
  }, [entries, searchTerm, statusFilter, ringFilter, selectedTab]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleCheckInStatusUpdate = async (status: CheckInStatus, notes?: string) => {
    if (!checkInDialog.entry) return;

    const entry = checkInDialog.entry;

    try {
      // Optimistic update
      setEntries(prev =>
        prev.map(e =>
          e.id === entry.id ? { ...e, checkInStatus: status, checkInTime: new Date() } : e
        )
      );

      // Log the check-in status change
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'gate_entry',
        entityId: entry.id,
        changes: {
          checkInStatus: { from: entry.checkInStatus, to: status },
        },
        metadata: {
          action: 'gate_steward_check_in_update',
          stewardId: user?.id,
          ring: entry.ring,
          armband: entry.armband,
          dogName: entry.dogName,
          handlerName: entry.handlerName,
          notes,
        },
      });

      // Close dialog
      setCheckInDialog({ open: false, entry: null });
    } catch (error) {
      logger.error(
        'Failed to update check-in status',
        'steward',
        { entryId: entry.id },
        error as Error
      );
      // Revert optimistic update
      setEntries(prev => prev.map(e => (e.id === entry.id ? entry : e)));
    }
  };

  const handleQuickStatusUpdate = async (entry: GateEntry, status: CheckInStatus) => {
    try {
      // Optimistic update
      setEntries(prev =>
        prev.map(e =>
          e.id === entry.id ? { ...e, checkInStatus: status, checkInTime: new Date() } : e
        )
      );

      // Log the quick action
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'gate_entry',
        entityId: entry.id,
        changes: {
          checkInStatus: { from: entry.checkInStatus, to: status },
        },
        metadata: {
          action: 'gate_steward_quick_update',
          stewardId: user?.id,
          ring: entry.ring,
          armband: entry.armband,
          dogName: entry.dogName,
        },
      });
    } catch (error) {
      logger.error(
        'Failed to update check-in status',
        'steward',
        { entryId: entry.id, status },
        error as Error
      );
    }
  };

  const refreshEntries = async () => {
    setRefreshing(true);
    await loadGateEntries();
    setRefreshing(false);
  };

  // Calculate stats
  const stats = {
    total: entries.length,
    needsAttention: entries.filter(
      e => requiresAction(e.checkInStatus) || e.checkInStatus === 'none' || e.isUrgent
    ).length,
    atGate: entries.filter(e => e.checkInStatus === 'at-gate' || e.checkInStatus === 'go-to-gate')
      .length,
    conflicts: entries.filter(e => e.checkInStatus === 'conflict').length,
    ready: entries.filter(e => e.checkInStatus === 'checked-in').length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted/50 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Gate Steward Dashboard</h2>
          <p className="text-muted-foreground">
            Managing Rings {assignedRings.join(', ')} • {entries.length} total entries
            {offlineStats && ` • ${offlineStats.checkedInCount} checked in`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Online Status */}
          {isOnline ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <Wifi className="h-3 w-3 mr-1" />
              Online
            </Badge>
          ) : (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              <WifiOff className="h-3 w-3 mr-1" />
              Offline
            </Badge>
          )}

          {/* Offline Check-In Interface */}
          <Dialog open={showOfflineInterface} onOpenChange={setShowOfflineInterface}>
            <DialogTrigger asChild>
              <Button>
                <QrCode className="h-4 w-4 mr-2" />
                Check-In Interface
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Offline Check-In Interface</DialogTitle>
              </DialogHeader>
              {user && (
                <OfflineCheckInInterface
                  gateId={gateId}
                  stewardId={user.id}
                  showId={showId}
                  onSessionEnd={() => setShowOfflineInterface(false)}
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Refresh Button */}
          <Button
            variant="outline"
            onClick={refreshEntries}
            disabled={refreshing}
            className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className={stats.needsAttention > 0 ? 'border-orange-200 bg-orange-50/50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.needsAttention}</div>
            <p className="text-xs text-muted-foreground">Action required</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Gate</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.atGate}</div>
            <p className="text-xs text-muted-foreground">Ready to run</p>
          </CardContent>
        </Card>

        <Card className={stats.conflicts > 0 ? 'border-red-200 bg-red-50/50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conflicts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.conflicts}</div>
            <p className="text-xs text-muted-foreground">Ring conflicts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ready}</div>
            <p className="text-xs text-muted-foreground">Checked in</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={ringFilter} onValueChange={setRingFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Ring" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rings</SelectItem>
                {assignedRings.map(ring => (
                  <SelectItem key={ring} value={ring}>
                    Ring {ring}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={value => setStatusFilter(value as CheckInStatus | 'all')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="none">Not Checked In</SelectItem>
                <SelectItem value="checked-in">Checked In</SelectItem>
                <SelectItem value="go-to-gate">Go to Gate</SelectItem>
                <SelectItem value="at-gate">At Gate</SelectItem>
                <SelectItem value="conflict">Conflict</SelectItem>
                <SelectItem value="pulled">Pulled</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setRingFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Entries List */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="bg-muted/50 backdrop-blur-sm p-1 h-auto grid grid-cols-5 gap-1">
          <TabsTrigger value="needs-attention">
            Needs Attention ({stats.needsAttention})
          </TabsTrigger>
          <TabsTrigger value="at-gate">At Gate ({stats.atGate})</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts ({stats.conflicts})</TabsTrigger>
          <TabsTrigger value="ready">Ready ({stats.ready})</TabsTrigger>
          <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="space-y-1">
                {filteredEntries.map(entry => (
                  <div
                    key={entry.id}
                    className={cn(
                      'border-b last:border-b-0 p-4 hover:bg-muted/50 transition-colors',
                      entry.isUrgent && 'bg-orange-50 dark:bg-orange-950/20 border-orange-200',
                      entry.checkInStatus === 'conflict' &&
                        'bg-red-50 dark:bg-red-950/20 border-red-200'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            #{entry.armband}
                          </Badge>
                          <Badge variant="secondary">Ring {entry.ring}</Badge>
                          {entry.isUrgent && (
                            <Badge variant="destructive" className="animate-pulse">
                              URGENT
                            </Badge>
                          )}
                        </div>

                        <div>
                          <div className="font-medium">{entry.dogName}</div>
                          <div className="text-sm text-muted-foreground">
                            {entry.handlerName} • {entry.className}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Judge: {entry.judgeAssigned}
                            {entry.estimatedRunTime && (
                              <span> • Est. {entry.estimatedRunTime.toLocaleTimeString()}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setCheckInDialog({ open: true, entry })}
                          className="hover:scale-105 transition-transform"
                        >
                          <CheckInStatusIndicator
                            status={entry.checkInStatus}
                            size="md"
                            showLabel={true}
                            showTooltip={true}
                          />
                        </button>

                        <CheckInQuickActions
                          currentStatus={entry.checkInStatus}
                          onUpdateStatus={status => handleQuickStatusUpdate(entry, status)}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {filteredEntries.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No entries match the current filters</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Check-In Status Dialog */}
      {checkInDialog.entry && (
        <CheckInStatusDialog
          open={checkInDialog.open}
          onOpenChange={open => {
            if (!open) {
              setCheckInDialog({ open: false, entry: null });
            }
          }}
          currentStatus={checkInDialog.entry.checkInStatus}
          entryInfo={{
            armband: checkInDialog.entry.armband,
            dogName: checkInDialog.entry.dogName,
            handlerName: checkInDialog.entry.handlerName,
            className: checkInDialog.entry.className,
            classNumber: checkInDialog.entry.classNumber,
          }}
          onUpdateStatus={handleCheckInStatusUpdate}
          readOnly={false}
          userRole="gate_steward"
        />
      )}
    </div>
  );
};
