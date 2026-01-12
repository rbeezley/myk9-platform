/**
 * Judge Check-In Interface
 * 
 * Allows judges and gate stewards to manage check-in status for all entries
 * in their assigned ring. Optimized for quick status updates during competition.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
import { logger } from '@/services/LoggingService';
  CheckInStatus, 
  requiresAction,
  canProceedToGate
} from '@/types/check-in-types';
import { 
  CheckInStatusIndicator, 
  CheckInQuickActions 
} from '@/components/common/CheckInStatusIndicator';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { useAuthContext } from '@/hooks/useAuthContext';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { 
  Search, 
  Filter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import '@/styles/apple-show-details.css';

interface RingEntry {
  id: string;
  entryNumber: string;
  armband: string;
  dogName: string;
  handlerName: string;
  ownerName: string;
  className: string;
  classNumber: string;
  checkInStatus: CheckInStatus;
  checkInTime?: Date;
  runOrder?: number;
  ring: string;
  estimatedRunTime?: Date;
  notes?: string;
}

interface JudgeCheckInInterfaceProps {
  ringNumber: string;
  judgeName: string;
  className?: string;
}

export const JudgeCheckInInterface: React.FC<JudgeCheckInInterfaceProps> = ({
  ringNumber,
  judgeName,
  className
}) => {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<RingEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<RingEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CheckInStatus | 'all'>('all');
  const [selectedTab, setSelectedTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInDialog, setCheckInDialog] = useState<{
    open: boolean;
    entry: RingEntry | null;
  }>({ open: false, entry: null });

  const loadRingEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      // Mock data - in real implementation, this would fetch from API
      const mockEntries: RingEntry[] = [
        {
          id: 'entry_1',
          entryNumber: 'E001',
          armband: '101',
          dogName: 'Bella',
          handlerName: 'Sarah Johnson',
          ownerName: 'Sarah Johnson',
          className: 'Open Standard',
          classNumber: '15',
          checkInStatus: 'checked-in',
          checkInTime: new Date(2024, 6, 15, 8, 30),
          runOrder: 1,
          ring: ringNumber,
          estimatedRunTime: new Date(2024, 6, 15, 9, 0)
        },
        {
          id: 'entry_2',
          entryNumber: 'E002',
          armband: '102',
          dogName: 'Max',
          handlerName: 'Mike Wilson',
          ownerName: 'Mike Wilson',
          className: 'Open Standard',
          classNumber: '15',
          checkInStatus: 'go-to-gate',
          runOrder: 2,
          ring: ringNumber,
          estimatedRunTime: new Date(2024, 6, 15, 9, 2)
        },
        {
          id: 'entry_3',
          entryNumber: 'E003',
          armband: '103',
          dogName: 'Luna',
          handlerName: 'Emma Davis',
          ownerName: 'Emma Davis',
          className: 'Open Standard',
          classNumber: '15',
          checkInStatus: 'none',
          runOrder: 3,
          ring: ringNumber,
          estimatedRunTime: new Date(2024, 6, 15, 9, 4)
        },
        {
          id: 'entry_4',
          entryNumber: 'E004',
          armband: '104',
          dogName: 'Charlie',
          handlerName: 'John Smith',
          ownerName: 'John Smith',
          className: 'Open Standard',
          classNumber: '15',
          checkInStatus: 'conflict',
          runOrder: 4,
          ring: ringNumber,
          estimatedRunTime: new Date(2024, 6, 15, 9, 6),
          notes: 'Handler conflict with Ring 3'
        },
        {
          id: 'entry_5',
          entryNumber: 'E005',
          armband: '105',
          dogName: 'Ruby',
          handlerName: 'Lisa Brown',
          ownerName: 'Lisa Brown',
          className: 'Open Standard',
          classNumber: '15',
          checkInStatus: 'at-gate',
          checkInTime: new Date(2024, 6, 15, 8, 45),
          runOrder: 5,
          ring: ringNumber,
          estimatedRunTime: new Date(2024, 6, 15, 9, 8)
        }
      ];

      setEntries(mockEntries);
    } catch (error) {
      logger.error('Failed to load ring entries:', 'components', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [ringNumber]);

  const applyFilters = useCallback(() => {
    let filtered = [...entries];

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.dogName.toLowerCase().includes(searchLower) ||
        entry.handlerName.toLowerCase().includes(searchLower) ||
        entry.armband.includes(searchLower) ||
        entry.entryNumber.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => entry.checkInStatus === statusFilter);
    }

    // Tab filter
    switch (selectedTab) {
      case 'needs-attention':
        filtered = filtered.filter(entry => 
          requiresAction(entry.checkInStatus) || 
          entry.checkInStatus === 'none'
        );
        break;
      case 'ready':
        filtered = filtered.filter(entry => 
          canProceedToGate(entry.checkInStatus) ||
          entry.checkInStatus === 'at-gate'
        );
        break;
      case 'issues':
        filtered = filtered.filter(entry => 
          entry.checkInStatus === 'conflict' || 
          entry.checkInStatus === 'pulled'
        );
        break;
      default:
        // 'all' - no additional filtering
        break;
    }

    // Sort by run order
    filtered.sort((a, b) => (a.runOrder || 999) - (b.runOrder || 999));

    setFilteredEntries(filtered);
  }, [entries, searchTerm, statusFilter, selectedTab]);

  useEffect(() => {
    loadRingEntries();
  }, [ringNumber, loadRingEntries]);

  useEffect(() => {
    applyFilters();
  }, [entries, searchTerm, statusFilter, selectedTab, applyFilters]);

  const handleCheckInStatusUpdate = async (status: CheckInStatus, notes?: string) => {
    if (!checkInDialog.entry) return;

    const entry = checkInDialog.entry;
    
    try {
      // Optimistic update
      setEntries(prev => prev.map(e => 
        e.id === entry.id 
          ? { ...e, checkInStatus: status, checkInTime: new Date(), notes }
          : e
      ));

      // Log the check-in status change
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ring_entry',
        entityId: entry.id,
        changes: {
          checkInStatus: { from: entry.checkInStatus, to: status }
        },
        metadata: {
          action: 'judge_check_in_update',
          judgeId: user?.id,
          judgeName,
          ringNumber,
          armband: entry.armband,
          dogName: entry.dogName,
          handlerName: entry.handlerName,
          notes
        }
      });

      // Close dialog
      setCheckInDialog({ open: false, entry: null });
    } catch (error) {
      logger.error('Failed to update check-in status:', 'components', {}, error as Error);
      // Revert optimistic update
      setEntries(prev => prev.map(e => 
        e.id === entry.id ? entry : e
      ));
    }
  };

  const handleQuickStatusUpdate = async (entry: RingEntry, status: CheckInStatus) => {
    try {
      // Optimistic update
      setEntries(prev => prev.map(e => 
        e.id === entry.id 
          ? { ...e, checkInStatus: status, checkInTime: new Date() }
          : e
      ));

      // Log the quick action
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ring_entry',
        entityId: entry.id,
        changes: {
          checkInStatus: { from: entry.checkInStatus, to: status }
        },
        metadata: {
          action: 'judge_quick_check_in',
          judgeId: user?.id,
          judgeName,
          ringNumber,
          armband: entry.armband,
          dogName: entry.dogName
        }
      });
    } catch (error) {
      logger.error('Failed to update check-in status:', 'components', {}, error as Error);
    }
  };

  const refreshEntries = async () => {
    setRefreshing(true);
    await loadRingEntries();
    setRefreshing(false);
  };

  // Calculate stats
  const stats = {
    total: entries.length,
    checkedIn: entries.filter(e => e.checkInStatus === 'checked-in').length,
    atGate: entries.filter(e => e.checkInStatus === 'at-gate').length,
    needsAttention: entries.filter(e => 
      requiresAction(e.checkInStatus) || e.checkInStatus === 'none'
    ).length,
    issues: entries.filter(e => 
      e.checkInStatus === 'conflict' || e.checkInStatus === 'pulled'
    ).length
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
          <h2 className="text-2xl font-bold tracking-tight">
            Ring {ringNumber} Check-In
          </h2>
          <p className="text-muted-foreground">
            Judge: {judgeName} • {entries.length} entries
          </p>
        </div>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.checkedIn}</div>
            <p className="text-xs text-muted-foreground">Ready to compete</p>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.needsAttention}</div>
            <p className="text-xs text-muted-foreground">Action required</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CheckInStatus | 'all')}>
              <SelectTrigger>
                <SelectValue placeholder="Check-In Status" />
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
                setStatusFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Entries List */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="bg-muted/50 backdrop-blur-sm border-b border-border/50 p-1 h-auto grid grid-cols-4 gap-1">
          <TabsTrigger value="all">
            All ({entries.length})
          </TabsTrigger>
          <TabsTrigger value="needs-attention">
            Needs Attention ({stats.needsAttention})
          </TabsTrigger>
          <TabsTrigger value="ready">
            Ready ({stats.checkedIn + stats.atGate})
          </TabsTrigger>
          <TabsTrigger value="issues">
            Issues ({stats.issues})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="space-y-1">
                {filteredEntries.map((entry) => (
                  <div 
                    key={entry.id} 
                    className={cn(
                      'border-b last:border-b-0 p-4 hover:bg-muted/50 transition-colors',
                      requiresAction(entry.checkInStatus) && 'bg-orange-50 dark:bg-orange-950/20',
                      entry.checkInStatus === 'conflict' && 'bg-red-50 dark:bg-red-950/20'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            #{entry.armband}
                          </Badge>
                          {entry.runOrder && (
                            <span className="text-sm text-muted-foreground">
                              Run {entry.runOrder}
                            </span>
                          )}
                        </div>
                        
                        <div>
                          <div className="font-medium">{entry.dogName}</div>
                          <div className="text-sm text-muted-foreground">
                            Handler: {entry.handlerName}
                          </div>
                          {entry.estimatedRunTime && (
                            <div className="text-xs text-muted-foreground">
                              Est. {entry.estimatedRunTime.toLocaleTimeString()}
                            </div>
                          )}
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
                          onUpdateStatus={(status) => handleQuickStatusUpdate(entry, status)}
                        />
                      </div>
                    </div>

                    {entry.notes && (
                      <div className="mt-2 text-sm text-muted-foreground bg-muted/50 rounded p-2">
                        <strong>Note:</strong> {entry.notes}
                      </div>
                    )}
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
          onOpenChange={(open) => {
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
            classNumber: checkInDialog.entry.classNumber
          }}
          onUpdateStatus={handleCheckInStatusUpdate}
          readOnly={false}
          userRole="judge"
        />
      )}
    </div>
  );
};