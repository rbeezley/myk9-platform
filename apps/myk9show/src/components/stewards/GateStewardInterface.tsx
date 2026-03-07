/**
 * Gate Steward Interface
 *
 * Enhanced interface for gate stewards with offline-first check-in support,
 * QR scanning, and comprehensive conflict resolution.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { Card, CardContent } from '@/components/ui/card';
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
import type { CheckInStatus } from '@/types/check-in-types';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { OfflineCheckInInterface } from '@/components/offline-checkin/OfflineCheckInInterface';
import { useAuthContext } from '@/hooks/useAuthContext';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { Search, RefreshCw, QrCode, Wifi, WifiOff } from 'lucide-react';

// Offline check-in services
import { offlineCheckInService } from '@/services/offline-checkin/OfflineCheckInService';
import { gateCoordinator } from '@/services/offline-checkin/GateCoordinator';
import type { CheckInStatistics } from '@/types/offline-checkin-types';
import { cn } from '@/lib/utils';

// Extracted modules
import type { GateEntry, GateStewardInterfaceProps } from './GateStewardInterface.types';
import {
  filterAndSortEntries,
  calculateGateStats,
  createMockEntries,
} from './GateStewardInterface.helpers';
import { GateStatsCards, GateEntryRow, GateEmptyState } from './GateStewardInterfaceComponents';

export const GateStewardInterface: React.FC<GateStewardInterfaceProps> = ({
  assignedRings = ['1', '2', '3', '4'],
  className,
  gateId = 'gate-1',
  showId = 'current-show',
}) => {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<GateEntry[]>([]);
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
  const [showOfflineInterface, setShowOfflineInterface] = useState(false);
  const [offlineStats, setOfflineStats] = useState<CheckInStatistics | null>(null);
  const [servicesInitialized, setServicesInitialized] = useState(false);

  // Derived state
  const filteredEntries = filterAndSortEntries(
    entries,
    searchTerm,
    statusFilter,
    ringFilter,
    selectedTab
  );
  const stats = calculateGateStats(entries);

  const loadOfflineStats = useCallback(async () => {
    if (servicesInitialized) {
      try {
        const s = await offlineCheckInService.getStatistics();
        setOfflineStats(s);
      } catch (error) {
        logger.error('Failed to load offline stats', 'steward', {}, error as Error);
      }
    }
  }, [servicesInitialized]);

  const loadGateEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      setEntries(createMockEntries());
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
      try {
        offlineCheckInService.removeAllListeners();
        gateCoordinator.removeAllListeners();
      } catch (error) {
        logger.error('Cleanup failed', 'steward', {}, error as Error);
      }
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

  const handleCheckInStatusUpdate = async (status: CheckInStatus, notes?: string) => {
    if (!checkInDialog.entry) return;
    const entry = checkInDialog.entry;

    try {
      setEntries(prev =>
        prev.map(e =>
          e.id === entry.id ? { ...e, checkInStatus: status, checkInTime: new Date() } : e
        )
      );

      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'gate_entry',
        entityId: entry.id,
        changes: { checkInStatus: { from: entry.checkInStatus, to: status } },
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

      setCheckInDialog({ open: false, entry: null });
    } catch (error) {
      logger.error(
        'Failed to update check-in status',
        'steward',
        { entryId: entry.id },
        error as Error
      );
      setEntries(prev => prev.map(e => (e.id === entry.id ? entry : e)));
    }
  };

  const handleQuickStatusUpdate = async (entry: GateEntry, status: CheckInStatus) => {
    try {
      setEntries(prev =>
        prev.map(e =>
          e.id === entry.id ? { ...e, checkInStatus: status, checkInTime: new Date() } : e
        )
      );

      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'gate_entry',
        entityId: entry.id,
        changes: { checkInStatus: { from: entry.checkInStatus, to: status } },
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
            Managing Rings {assignedRings.join(', ')} &bull; {entries.length} total entries
            {offlineStats && ` \u2022 ${offlineStats.checkedInCount} checked in`}
          </p>
        </div>

        <div className="flex items-center gap-2">
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
      <GateStatsCards stats={stats} />

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
                  <GateEntryRow
                    key={entry.id}
                    entry={entry}
                    onStatusClick={e => setCheckInDialog({ open: true, entry: e })}
                    onQuickStatusUpdate={handleQuickStatusUpdate}
                  />
                ))}
                {filteredEntries.length === 0 && <GateEmptyState />}
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
            if (!open) setCheckInDialog({ open: false, entry: null });
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
