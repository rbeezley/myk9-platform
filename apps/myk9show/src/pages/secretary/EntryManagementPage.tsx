import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
// import { Textarea } from '@/components/ui/textarea';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useStatusUpdates, notificationService } from '@/services/NotificationService';
import { auditService } from '@/services/AuditService';
import { UserRole } from '@/types/auth-types';
import { AuditAction, NotificationType } from '@/types/audit-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { logger } from '@/services/LoggingService';
import {
  Search, 
  Filter,
  Users, 
  Clock,
  CheckCircle2,
  AlertCircle,
  Mail,
  MessageSquare,
  Download,
  Upload,
  DollarSign
} from 'lucide-react';

interface EntryManagementEntry {
  id: string;
  registrationId: string;
  entryNumber: string;
  showId: string;
  dogName: string;
  ownerName: string;
  ownerEmail: string;
  handlerName: string;
  classes: EntryClass[];
  totalFee: number;
  paidAmount: number;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  submittedAt: Date;
  lastUpdated: Date;
  notes?: string;
  armbandNumber?: string;
}

interface EntryClass {
  id: string;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
  checkInStatus?: CheckInStatus;
  checkInTime?: Date;
}

interface BulkAction {
  type: 'status_change' | 'payment_update' | 'send_notification' | 'export';
  data: Record<string, unknown>;
}

const EntryManagementPage: React.FC = () => {
  const { user, hasRole } = useAuthContext();
  const [entries, setEntries] = useState<EntryManagementEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<EntryManagementEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedTab, setSelectedTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  // const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkActionDialog, setBulkActionDialog] = useState<{ open: boolean; action: string | null }>({ open: false, action: null });
  const [checkInDialog, setCheckInDialog] = useState<{
    open: boolean;
    entry: EntryManagementEntry | null;
    classEntry: EntryClass | null;
  }>({ open: false, entry: null, classEntry: null });

  // Real-time status updates for entries
  const { status: entryUpdates } = useStatusUpdates('entries', 'all');

  // Mock functions for hooks (would be real implementations)
  const loadEntries = async () => {
    setIsLoading(true);
    try {
      // Mock implementation
      const mockEntries: EntryManagementEntry[] = [];
      setEntries(mockEntries);
      setFilteredEntries(mockEntries);
    } catch (error) {
      logger.error('Error loading entries:', 'pages', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEntryUpdate = (update: Record<string, unknown>) => {
    logger.debug('Entry update received:', 'secretary', { data: update });
    // Would handle real-time updates here
  };

  const applyFilters = useCallback(() => {
    let filtered = entries;
    
    // Apply filters
    if (selectedTab !== 'all') {
      filtered = filtered.filter(() => {
        // Filter logic based on selectedTab
        return true; // Simplified
      });
    }
    
    if (searchTerm) {
      filtered = filtered.filter(entry => 
        entry.dogName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.entryNumber.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredEntries(filtered);
  }, [entries, selectedTab, searchTerm]);

  useEffect(() => {
    loadEntries();
    auditService.log({
      action: AuditAction.READ,
      entityType: 'entry_management',
      entityId: user?.id || 'unknown',
      metadata: {
        page: 'entry_management',
        loadTime: new Date().toISOString()
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (entryUpdates) {
      handleEntryUpdate(entryUpdates);
    }
  }, [entryUpdates]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters, statusFilter, paymentFilter]);

  // Verify secretary role access
  if (!hasRole(UserRole.SECRETARY) && !hasRole(UserRole.CLUB_ADMIN) && !hasRole(UserRole.SITE_ADMIN)) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              This page is only accessible to users with secretary permissions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSelectEntry = (entryId: string, checked: boolean) => {
    setSelectedEntries(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(entryId);
      } else {
        newSet.delete(entryId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEntries(new Set(filteredEntries.map(e => e.id)));
    } else {
      setSelectedEntries(new Set());
    }
  };

  const handleStatusChange = async (entryId: string, newStatus: EntryStatus) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const oldStatus = entry.entryStatus;

    // Optimistic update
    setEntries(prev => prev.map(e =>
      e.id === entryId ? { ...e, entryStatus: newStatus, lastUpdated: new Date() } : e
    ));

    try {
      // Audit log
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'entry',
        entityId: entryId,
        changes: {
          entryStatus: { from: oldStatus, to: newStatus }
        },
        metadata: {
          action: 'status_change',
          secretaryId: user?.id,
          entryNumber: entry.entryNumber
        }
      });

      // Notify exhibitor via real-time system
      notificationService.publish({
        type: NotificationType.ENTRY_CHANGE,
        channel: `user:${entry.ownerEmail}`,
        sender: {
          id: user?.id || 'secretary',
          name: user?.email || 'Secretary',
          role: 'secretary'
        },
        data: {
          type: 'entry_status_changed',
          entryId,
          entryNumber: entry.entryNumber,
          dogName: entry.dogName,
          oldStatus,
          newStatus,
          changedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to update entry status:', 'pages', {}, error as Error);
      // Revert optimistic update
      setEntries(prev => prev.map(e =>
        e.id === entryId ? { ...e, entryStatus: oldStatus } : e
      ));
    }
  };

  const handleCheckInStatusUpdate = async (status: CheckInStatus, notes?: string) => {
    if (!checkInDialog.entry || !checkInDialog.classEntry) return;

    const { entry, classEntry } = checkInDialog;
    
    try {
      // Optimistic update
      setEntries(prev => prev.map(e => {
        if (e.id === entry.id) {
          return {
            ...e,
            classes: e.classes.map(c => 
              c.id === classEntry.id 
                ? { ...c, checkInStatus: status, checkInTime: new Date() }
                : c
            )
          };
        }
        return e;
      }));

      // Log the check-in status change
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'class_entry',
        entityId: classEntry.id,
        changes: {
          checkInStatus: { from: classEntry.checkInStatus || 'none', to: status }
        },
        metadata: {
          action: 'check_in_status_change',
          secretaryId: user?.id,
          entryNumber: entry.entryNumber,
          dogName: entry.dogName,
          className: classEntry.name,
          notes
        }
      });

      // Close dialog
      setCheckInDialog({ open: false, entry: null, classEntry: null });
    } catch (error) {
      logger.error('Failed to update check-in status:', 'pages', {}, error as Error);
      // Revert optimistic update
      setEntries(prev => prev.map(e => {
        if (e.id === entry.id) {
          return {
            ...e,
            classes: e.classes.map(c => 
              c.id === classEntry.id 
                ? { ...c, checkInStatus: classEntry.checkInStatus, checkInTime: classEntry.checkInTime }
                : c
            )
          };
        }
        return e;
      }));
    }
  };

  const handleBulkAction = async (action: BulkAction) => {
    const selectedEntryIds = Array.from(selectedEntries);
    
    try {
      switch (action.type) {
        case 'status_change':
          for (const entryId of selectedEntryIds) {
            await handleStatusChange(entryId, action.data.status as EntryStatus);
          }
          break;
        
        case 'send_notification':
          // Send bulk notification
          await auditService.log({
            action: AuditAction.SYSTEM_ACTION,
            entityType: 'bulk_notification',
            entityId: 'bulk_' + Date.now(),
            metadata: {
              action: 'send_notification',
              entryCount: selectedEntryIds.length,
              message: action.data.message,
              secretaryId: user?.id
            }
          });
          break;
          
        case 'export':
          // Export selected entries
          await auditService.log({
            action: AuditAction.EXPORT,
            entityType: 'entries_export',
            entityId: 'export_' + Date.now(),
            metadata: {
              action: 'export_entries',
              entryCount: selectedEntryIds.length,
              format: action.data.format,
              secretaryId: user?.id
            }
          });
          break;
      }

      setSelectedEntries(new Set());
      setBulkActionDialog({ open: false, action: null });
    } catch (error) {
      logger.error('Failed to execute bulk action:', 'pages', {}, error as Error);
    }
  };

  const getEntryStatusBadge = (status: EntryStatus) => {
    switch (status) {
      case EntryStatus.ACCEPTED:
        return <Badge className="bg-green-100 text-green-800">Accepted</Badge>;
      case EntryStatus.PENDING:
        return <Badge variant="secondary">Pending</Badge>;
      case EntryStatus.WAITLIST:
        return <Badge className="bg-yellow-100 text-yellow-800">Waitlist</Badge>;
      case EntryStatus.REJECTED:
        return <Badge variant="destructive">Rejected</Badge>;
      case EntryStatus.CANCELLED:
        return <Badge variant="outline">Cancelled</Badge>;
      case EntryStatus.MISSING_INFO:
        return <Badge className="bg-orange-100 text-orange-800">Missing Info</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID_ONLINE:
      case PaymentStatus.PAID_BY_CHECK:
      case PaymentStatus.PAID_BY_CASH:
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case PaymentStatus.PENDING:
        return <Badge className="bg-red-100 text-red-800">Payment Due</Badge>;
      case PaymentStatus.REFUNDED:
        return <Badge variant="outline" className="text-blue-600">Refunded</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const stats = {
    total: entries.length,
    pending: entries.filter(e => e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING).length,
    accepted: entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length,
    waitlist: entries.filter(e => e.entryStatus === EntryStatus.WAITLIST).length,
    revenue: entries.reduce((sum, e) => sum + e.paidAmount, 0)
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="grid gap-6">
          <div className="h-8 bg-muted rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Entry Management</h1>
          <p className="text-muted-foreground">
            Manage show entries, process payments, and communicate with exhibitors
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
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
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Need review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.accepted}</div>
            <p className="text-xs text-muted-foreground">Confirmed entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waitlist</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.waitlist}</div>
            <p className="text-xs text-muted-foreground">Waiting for spots</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.revenue}</div>
            <p className="text-xs text-muted-foreground">Collected fees</p>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Entry Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value={EntryStatus.PENDING}>Pending</SelectItem>
                <SelectItem value={EntryStatus.ACCEPTED}>Accepted</SelectItem>
                <SelectItem value={EntryStatus.WAITLIST}>Waitlist</SelectItem>
                <SelectItem value={EntryStatus.REJECTED}>Rejected</SelectItem>
                <SelectItem value={EntryStatus.MISSING_INFO}>Missing Info</SelectItem>
              </SelectContent>
            </Select>

            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value={PaymentStatus.PENDING}>Payment Due</SelectItem>
                <SelectItem value={PaymentStatus.PAID_ONLINE}>Paid Online</SelectItem>
                <SelectItem value={PaymentStatus.PAID_BY_CHECK}>Paid by Check</SelectItem>
                <SelectItem value={PaymentStatus.REFUNDED}>Refunded</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setPaymentFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedEntries.size > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <span className="font-medium">
                {selectedEntries.size} entries selected
              </span>
              <div className="flex gap-2">
                <Dialog open={bulkActionDialog.open} onOpenChange={(open) => setBulkActionDialog({ ...bulkActionDialog, open })}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      onClick={() => setBulkActionDialog({ open: true, action: 'status_change' })}
                    >
                      Change Status
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Bulk Status Change</DialogTitle>
                      <DialogDescription>
                        Change status for {selectedEntries.size} selected entries
                      </DialogDescription>
                    </DialogHeader>
                    <Select onValueChange={(value) => handleBulkAction({ type: 'status_change', data: { status: value }})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select new status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EntryStatus.ACCEPTED}>Accept</SelectItem>
                        <SelectItem value={EntryStatus.WAITLIST}>Move to Waitlist</SelectItem>
                        <SelectItem value={EntryStatus.REJECTED}>Reject</SelectItem>
                      </SelectContent>
                    </Select>
                  </DialogContent>
                </Dialog>

                <Button size="sm" variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
                
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Selected
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entries Table */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">All ({filteredEntries.length})</TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({entries.filter(e => e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING).length})
          </TabsTrigger>
          <TabsTrigger value="accepted">
            Accepted ({entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length})
          </TabsTrigger>
          <TabsTrigger value="waitlist">
            Waitlist ({entries.filter(e => e.entryStatus === EntryStatus.WAITLIST).length})
          </TabsTrigger>
          <TabsTrigger value="issues">
            Issues ({entries.filter(e => e.entryStatus === EntryStatus.MISSING_INFO || (e.entryStatus === EntryStatus.ACCEPTED && e.paymentStatus === PaymentStatus.PENDING)).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Entries ({filteredEntries.length})</CardTitle>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedEntries.size === filteredEntries.length && filteredEntries.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">Select All</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <Checkbox
                          checked={selectedEntries.has(entry.id)}
                          onCheckedChange={(checked) => handleSelectEntry(entry.id, checked as boolean)}
                        />
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{entry.entryNumber}</h4>
                            <span className="text-muted-foreground">•</span>
                            <span className="font-medium">{entry.dogName}</span>
                            {entry.armbandNumber && (
                              <>
                                <span className="text-muted-foreground">•</span>
                                <Badge variant="outline">{entry.armbandNumber}</Badge>
                              </>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-muted-foreground mb-2">
                            <span>Owner: {entry.ownerName}</span>
                            <span>Handler: {entry.handlerName}</span>
                            <span>Classes: {entry.classes.length}</span>
                            <span>Fee: ${entry.totalFee} (Paid: ${entry.paidAmount})</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {getEntryStatusBadge(entry.entryStatus)}
                            {getPaymentStatusBadge(entry.paymentStatus)}
                            {entry.notes && (
                              <Badge variant="outline" className="text-blue-600">
                                <MessageSquare className="h-3 w-3 mr-1" />
                                Notes
                              </Badge>
                            )}
                          </div>
                          
                          {/* Class Check-In Status */}
                          <div className="mt-2 space-y-1">
                            {entry.classes.map((cls) => (
                              <div key={cls.id} className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">{cls.name}:</span>
                                <button
                                  onClick={() => setCheckInDialog({ 
                                    open: true, 
                                    entry, 
                                    classEntry: cls 
                                  })}
                                  className="hover:scale-105 transition-transform"
                                >
                                  <CheckInStatusIndicator 
                                    status={cls.checkInStatus || 'none'} 
                                    size="sm"
                                    showLabel={true}
                                    showTooltip={true}
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {entry.entryStatus === EntryStatus.PENDING && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleStatusChange(entry.id, EntryStatus.ACCEPTED)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(entry.id, EntryStatus.WAITLIST)}
                            >
                              Waitlist
                            </Button>
                          </>
                        )}
                        
                        <Select onValueChange={(value) => handleStatusChange(entry.id, value as EntryStatus)}>
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Actions" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EntryStatus.ACCEPTED}>Accept</SelectItem>
                            <SelectItem value={EntryStatus.WAITLIST}>Waitlist</SelectItem>
                            <SelectItem value={EntryStatus.REJECTED}>Reject</SelectItem>
                            <SelectItem value={EntryStatus.MISSING_INFO}>Missing Info</SelectItem>
                          </SelectContent>
                        </Select>
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
      {checkInDialog.entry && checkInDialog.classEntry && (
        <CheckInStatusDialog
          open={checkInDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setCheckInDialog({ open: false, entry: null, classEntry: null });
            }
          }}
          currentStatus={checkInDialog.classEntry.checkInStatus || 'none'}
          entryInfo={{
            armband: checkInDialog.entry.armbandNumber || checkInDialog.entry.entryNumber,
            dogName: checkInDialog.entry.dogName,
            handlerName: checkInDialog.entry.handlerName,
            className: checkInDialog.classEntry.name,
            classNumber: checkInDialog.classEntry.number
          }}
          onUpdateStatus={handleCheckInStatusUpdate}
          readOnly={false}
          userRole="secretary"
        />
      )}
    </div>
  );
};

export default EntryManagementPage;