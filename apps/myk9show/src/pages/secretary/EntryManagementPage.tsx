// @ts-nocheck
// TODO: Refactor to use correct types once secretaryEntryQueries.ts is updated to match schema
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { getSecretaryShows } from '@/services/database/queries/showQueries';
import {
  getEntriesForShow,
  updateEntryStatus,
  bulkUpdateEntryStatus,
  updateCheckInStatus,
  bulkCheckIn,
  assignArmband,
  autoAssignArmbands,
  getEntriesForExport,
  SecretaryEntry,
} from '@/services/database/queries/secretaryEntryQueries';
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
  DollarSign,
  Calendar,
  Hash,
  Loader2,
  RefreshCw,
  ArrowUpCircle,
  XCircle,
} from 'lucide-react';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { ScratchManagementTab } from '@/components/entries/ScratchManagementTab';

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

interface Show {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
}

const EntryManagementPage: React.FC = () => {
  const { user, hasRole } = useAuthContext();

  // Show selection
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [isLoadingShows, setIsLoadingShows] = useState(true);

  // Entry data
  const [entries, setEntries] = useState<EntryManagementEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<EntryManagementEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedTab, setSelectedTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [bulkActionDialog, setBulkActionDialog] = useState<{ open: boolean; action: string | null }>({ open: false, action: null });
  const [checkInDialog, setCheckInDialog] = useState<{
    open: boolean;
    entry: EntryManagementEntry | null;
    classEntry: EntryClass | null;
  }>({ open: false, entry: null, classEntry: null });
  const [armbandDialog, setArmbandDialog] = useState<{
    open: boolean;
    entry: EntryManagementEntry | null;
    value: string;
  }>({ open: false, entry: null, value: '' });
  const [autoArmbandDialog, setAutoArmbandDialog] = useState<{
    open: boolean;
    startNumber: string;
  }>({ open: false, startNumber: '1' });
  const [isProcessing, setIsProcessing] = useState(false);

  // Real-time status updates for entries
  const { status: entryUpdates } = useStatusUpdates('entries', 'all');

  // Load shows on mount
  useEffect(() => {
    loadShows();
  }, []);

  // Load entries when show changes
  useEffect(() => {
    if (selectedShowId) {
      loadEntries(selectedShowId);
    } else {
      setEntries([]);
      setFilteredEntries([]);
    }
  }, [selectedShowId]);

  const loadShows = async () => {
    setIsLoadingShows(true);
    try {
      const { data, error } = await getSecretaryShows(user?.id || '');
      if (error) {
        logger.error('Error loading shows:', 'secretary', {}, error as Error);
      } else {
        setShows(data || []);
      }
    } catch (err) {
      logger.error('Error loading shows:', 'secretary', {}, err as Error);
    } finally {
      setIsLoadingShows(false);
    }
  };

  const loadEntries = async (showId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await getEntriesForShow(showId);

      if (error) {
        setError('Failed to load entries');
        logger.error('Error loading entries:', 'secretary', {}, error as Error);
        return;
      }

      // Transform database entries to UI format
      const transformedEntries: EntryManagementEntry[] = (data || []).map((entry: SecretaryEntry) => ({
        id: entry.id,
        registrationId: entry.id,
        entryNumber: entry.armband_number || entry.id.slice(0, 8).toUpperCase(),
        showId: entry.show_id,
        dogName: entry.dog?.name || 'Unknown Dog',
        ownerName: entry.owner
          ? `${entry.owner.first_name || ''} ${entry.owner.last_name || ''}`.trim() || 'Unknown'
          : 'Unknown',
        ownerEmail: entry.owner?.email || '',
        handlerName: entry.handler || entry.owner
          ? `${entry.owner?.first_name || ''} ${entry.owner?.last_name || ''}`.trim()
          : 'Not specified',
        classes: (entry.class_entries || []).map((ce) => ({
          id: ce.id,
          name: ce.class?.name || 'Unknown Class',
          number: ce.class?.class_number || '',
          fee: ce.entry_fee || 0,
          jumpHeight: ce.jump_height || undefined,
          status: mapClassEntryStatus(ce.status),
          checkInStatus: ce.check_in_status as CheckInStatus | undefined,
          checkInTime: ce.check_in_time ? new Date(ce.check_in_time) : undefined,
        })),
        totalFee: entry.total_fees || 0,
        paidAmount: entry.payment_status === 'paid' ? (entry.total_fees || 0) : 0,
        entryStatus: mapEntryStatus(entry.entry_status),
        paymentStatus: mapPaymentStatus(entry.payment_status),
        submittedAt: entry.submitted_at ? new Date(entry.submitted_at) : new Date(entry.created_at),
        lastUpdated: new Date(entry.updated_at),
        notes: entry.special_requests || undefined,
        armbandNumber: entry.armband_number || undefined,
      }));

      setEntries(transformedEntries);
      setFilteredEntries(transformedEntries);
    } catch (err) {
      setError('Failed to load entries');
      logger.error('Error loading entries:', 'secretary', {}, err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions to map database status to UI enums
  const mapEntryStatus = (status: string | null): EntryStatus => {
    switch (status) {
      case 'accepted': return EntryStatus.ACCEPTED;
      case 'pending': return EntryStatus.PENDING;
      case 'waitlisted': return EntryStatus.WAITLIST;
      case 'rejected': return EntryStatus.REJECTED;
      case 'cancelled': return EntryStatus.CANCELLED;
      default: return EntryStatus.PENDING;
    }
  };

  const mapPaymentStatus = (status: string | null): PaymentStatus => {
    switch (status) {
      case 'paid': return PaymentStatus.PAID_ONLINE;
      case 'pending': return PaymentStatus.PENDING;
      case 'refunded': return PaymentStatus.REFUNDED;
      default: return PaymentStatus.PENDING;
    }
  };

  const mapClassEntryStatus = (status: string | null): 'entered' | 'scratched' | 'moved' | 'absent' => {
    switch (status) {
      case 'accepted':
      case 'pending':
        return 'entered';
      case 'withdrawn':
      case 'scratched':
        return 'scratched';
      case 'moved':
        return 'moved';
      case 'absent':
        return 'absent';
      default:
        return 'entered';
    }
  };

  const mapStatusToDb = (status: EntryStatus): string => {
    switch (status) {
      case EntryStatus.ACCEPTED: return 'accepted';
      case EntryStatus.PENDING: return 'pending';
      case EntryStatus.WAITLIST: return 'waitlisted';
      case EntryStatus.REJECTED: return 'rejected';
      case EntryStatus.CANCELLED: return 'cancelled';
      default: return 'pending';
    }
  };

  const handleEntryUpdate = (update: Record<string, unknown>) => {
    logger.debug('Entry update received:', 'secretary', { data: update });
    // Would handle real-time updates here
  };

  const applyFilters = useCallback(() => {
    let filtered = entries;

    // Apply tab filters
    if (selectedTab === 'pending') {
      filtered = filtered.filter(e =>
        e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING
      );
    } else if (selectedTab === 'accepted') {
      filtered = filtered.filter(e => e.entryStatus === EntryStatus.ACCEPTED);
    } else if (selectedTab === 'waitlist') {
      filtered = filtered.filter(e => e.entryStatus === EntryStatus.WAITLIST);
    } else if (selectedTab === 'issues') {
      filtered = filtered.filter(e =>
        e.entryStatus === EntryStatus.MISSING_INFO ||
        (e.entryStatus === EntryStatus.ACCEPTED && e.paymentStatus === PaymentStatus.PENDING)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.entryStatus === statusFilter);
    }

    // Apply payment filter
    if (paymentFilter !== 'all') {
      filtered = filtered.filter(e => e.paymentStatus === paymentFilter);
    }

    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.dogName.toLowerCase().includes(search) ||
        entry.ownerName.toLowerCase().includes(search) ||
        entry.entryNumber.toLowerCase().includes(search) ||
        entry.armbandNumber?.toLowerCase().includes(search)
      );
    }

    setFilteredEntries(filtered);
  }, [entries, selectedTab, searchTerm, statusFilter, paymentFilter]);

  useEffect(() => {
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
  }, [applyFilters]);

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
      // Update in database
      const { error: dbError } = await updateEntryStatus(entryId, mapStatusToDb(newStatus));

      if (dbError) {
        throw dbError;
      }

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

  // Handle armband assignment
  const handleAssignArmband = async () => {
    if (!armbandDialog.entry || !armbandDialog.value.trim()) return;

    setIsProcessing(true);
    try {
      const { error: dbError } = await assignArmband(armbandDialog.entry.id, armbandDialog.value.trim());

      if (dbError) {
        setError('Failed to assign armband');
        return;
      }

      // Update local state
      setEntries(prev => prev.map(e =>
        e.id === armbandDialog.entry?.id
          ? { ...e, armbandNumber: armbandDialog.value.trim(), entryNumber: armbandDialog.value.trim() }
          : e
      ));

      setArmbandDialog({ open: false, entry: null, value: '' });
    } catch (err) {
      setError('Failed to assign armband');
      logger.error('Error assigning armband:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle auto-assign armbands
  const handleAutoAssignArmbands = async () => {
    if (!selectedShowId) return;

    setIsProcessing(true);
    try {
      const startNum = parseInt(autoArmbandDialog.startNumber, 10) || 1;
      const { data, error: dbError } = await autoAssignArmbands(selectedShowId, startNum);

      if (dbError) {
        setError('Failed to auto-assign armbands');
        return;
      }

      // Reload entries to get updated armbands
      await loadEntries(selectedShowId);
      setAutoArmbandDialog({ open: false, startNumber: '1' });

      logger.info(`Auto-assigned ${data?.assigned} armbands starting at ${data?.startedAt}`, 'secretary');
    } catch (err) {
      setError('Failed to auto-assign armbands');
      logger.error('Error auto-assigning armbands:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle bulk check-in
  const handleBulkCheckIn = async () => {
    const selectedEntryIds = Array.from(selectedEntries);
    if (selectedEntryIds.length === 0) return;

    setIsProcessing(true);
    try {
      // Get all class entry IDs for selected entries
      const classEntryIds: string[] = [];
      for (const entryId of selectedEntryIds) {
        const entry = entries.find(e => e.id === entryId);
        if (entry) {
          entry.classes.forEach(c => classEntryIds.push(c.id));
        }
      }

      const { error: dbError } = await bulkCheckIn(classEntryIds);

      if (dbError) {
        setError('Failed to bulk check-in');
        return;
      }

      // Update local state
      setEntries(prev => prev.map(e => {
        if (selectedEntryIds.includes(e.id)) {
          return {
            ...e,
            classes: e.classes.map(c => ({
              ...c,
              checkInStatus: 'checked_in' as CheckInStatus,
              checkInTime: new Date(),
            })),
          };
        }
        return e;
      }));

      setSelectedEntries(new Set());
      setBulkActionDialog({ open: false, action: null });
    } catch (err) {
      setError('Failed to bulk check-in');
      logger.error('Error bulk check-in:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle CSV export
  const handleExportCSV = async () => {
    if (!selectedShowId) return;

    setIsProcessing(true);
    try {
      const { data, error: dbError } = await getEntriesForExport(selectedShowId);

      if (dbError || !data) {
        setError('Failed to export entries');
        return;
      }

      // Build CSV content
      const headers = [
        'Armband',
        'Dog Name',
        'Call Name',
        'Breed',
        'Registration #',
        'Owner First Name',
        'Owner Last Name',
        'Owner Email',
        'Owner Phone',
        'Handler',
        'Entry Status',
        'Payment Status',
        'Total Fees',
        'Classes',
        'Special Requests',
      ];

      const rows = data.map((entry) => {
        const dog = entry.dog as { name?: string; call_name?: string; breed?: string; registration_number?: string } | null;
        const owner = entry.owner as { first_name?: string; last_name?: string; email?: string; phone?: string } | null;
        const classes = (entry.class_entry || [])
          .map((ce) => {
            const cls = ce.class as { name?: string; class_number?: string } | null;
            return `${cls?.name || 'Unknown'}${ce.jump_height ? ` (${ce.jump_height})` : ''}`;
          })
          .join('; ');

        return [
          entry.armband_number || '',
          dog?.name || '',
          dog?.call_name || '',
          dog?.breed || '',
          dog?.registration_number || '',
          owner?.first_name || '',
          owner?.last_name || '',
          owner?.email || '',
          owner?.phone || '',
          entry.handler || '',
          entry.entry_status || '',
          entry.payment_status || '',
          entry.total_fees?.toString() || '0',
          classes,
          entry.special_requests || '',
        ];
      });

      // Create CSV string
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `entries_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await auditService.log({
        action: AuditAction.EXPORT,
        entityType: 'entries_export',
        entityId: selectedShowId,
        metadata: {
          format: 'csv',
          entryCount: data.length,
          secretaryId: user?.id,
        },
      });
    } catch (err) {
      setError('Failed to export entries');
      logger.error('Error exporting entries:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckInStatusUpdate = async (status: CheckInStatus, notes?: string) => {
    if (!checkInDialog.entry || !checkInDialog.classEntry) return;

    const { entry, classEntry } = checkInDialog;

    try {
      // Update in database
      const { error: dbError } = await updateCheckInStatus(classEntry.id, status, notes);

      if (dbError) {
        throw dbError;
      }

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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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
          <Button
            variant="outline"
            onClick={() => selectedShowId && loadEntries(selectedShowId)}
            disabled={!selectedShowId || isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => setAutoArmbandDialog({ open: true, startNumber: '1' })}
            disabled={!selectedShowId}
          >
            <Hash className="h-4 w-4 mr-2" />
            Auto-Assign Armbands
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={!selectedShowId || isProcessing}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Show Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Select Show
          </CardTitle>
          <CardDescription>Choose a show to manage its entries</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedShowId}
            onValueChange={setSelectedShowId}
            disabled={isLoadingShows}
          >
            <SelectTrigger className="w-full md:w-96">
              <SelectValue placeholder={isLoadingShows ? 'Loading shows...' : 'Select a show'} />
            </SelectTrigger>
            <SelectContent>
              {shows.map((show) => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name || 'Unnamed Show'} ({formatDate(show.start_date)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* No Show Selected */}
      {!selectedShowId && !isLoadingShows && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Select a Show</h3>
            <p className="text-muted-foreground">
              Choose a show from the dropdown above to manage its entries.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && selectedShowId && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Main Content - Only show when a show is selected and not loading */}
      {selectedShowId && !isLoading && (
        <>

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

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkActionDialog({ open: true, action: 'check_in' })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Bulk Check-In
                </Button>

                <Button size="sm" variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entries Table */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-7">
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
          <TabsTrigger value="move-ups">
            <ArrowUpCircle className="h-4 w-4 mr-1" />
            Move-Ups
          </TabsTrigger>
          <TabsTrigger value="scratches">
            <XCircle className="h-4 w-4 mr-1" />
            Scratches
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

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setArmbandDialog({
                            open: true,
                            entry,
                            value: entry.armbandNumber || '',
                          })}
                          title="Assign Armband"
                        >
                          <Hash className="h-4 w-4" />
                        </Button>

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

        {/* Move-Ups Tab Content */}
        <TabsContent value="move-ups" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <MoveUpRequestsTab showId={selectedShowId} onRefresh={() => loadEntries(selectedShowId)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scratches Tab Content */}
        <TabsContent value="scratches" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <ScratchManagementTab showId={selectedShowId} onRefresh={() => loadEntries(selectedShowId)} />
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

        </>
      )}

      {/* Armband Assignment Dialog */}
      <Dialog
        open={armbandDialog.open}
        onOpenChange={(open) => !open && setArmbandDialog({ open: false, entry: null, value: '' })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Armband</DialogTitle>
            <DialogDescription>
              Assign an armband number to {armbandDialog.entry?.dogName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="armband-number">Armband Number</Label>
              <Input
                id="armband-number"
                value={armbandDialog.value}
                onChange={(e) => setArmbandDialog((prev) => ({ ...prev, value: e.target.value }))}
                placeholder="Enter armband number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArmbandDialog({ open: false, entry: null, value: '' })}
            >
              Cancel
            </Button>
            <Button onClick={handleAssignArmband} disabled={isProcessing || !armbandDialog.value.trim()}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Assign Armbands Dialog */}
      <Dialog
        open={autoArmbandDialog.open}
        onOpenChange={(open) => !open && setAutoArmbandDialog({ open: false, startNumber: '1' })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-Assign Armbands</DialogTitle>
            <DialogDescription>
              Automatically assign sequential armband numbers to all accepted entries without armbands.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="start-number">Starting Number</Label>
              <Input
                id="start-number"
                type="number"
                min="1"
                value={autoArmbandDialog.startNumber}
                onChange={(e) =>
                  setAutoArmbandDialog((prev) => ({ ...prev, startNumber: e.target.value }))
                }
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                Armbands will be assigned starting from this number, skipping any already assigned.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAutoArmbandDialog({ open: false, startNumber: '1' })}
            >
              Cancel
            </Button>
            <Button onClick={handleAutoAssignArmbands} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Auto-Assign'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Check-In Dialog */}
      <Dialog
        open={bulkActionDialog.open && bulkActionDialog.action === 'check_in'}
        onOpenChange={(open) => !open && setBulkActionDialog({ open: false, action: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Check-In</DialogTitle>
            <DialogDescription>
              Check in all classes for {selectedEntries.size} selected entries?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkActionDialog({ open: false, action: null })}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkCheckIn} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking In...
                </>
              ) : (
                'Check In All'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EntryManagementPage;