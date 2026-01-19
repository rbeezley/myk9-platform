/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// TODO: Fix type mismatches with entry query results
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useStatusUpdates } from '@/services/NotificationService';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { logger } from '@/services/LoggingService';
import { getUserEntries } from '@/services/database/queries/entryQueries';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import { EntryStatusStepper } from '@/components/entries/EntryStatusStepper';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Eye,
  Edit,
  Download,
  RefreshCw,
  Plus
} from 'lucide-react';
import { formatDistanceToNow, format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import '@/styles/apple-show-details.css';

interface MyEntry {
  id: string;
  registrationId: string;
  showId: string;
  showName: string;
  showDate: Date;
  location: {
    venue: string;
    city: string;
    state: string;
  };
  dogName: string;
  dogId: string;
  classes: EntryClass[];
  totalFee: number;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  registrationNumber?: string;
  confirmationNumber?: string;
  submittedAt: Date;
  lastUpdated: Date;
}

interface EntryClass {
  id: string;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string;
  runOrder?: number;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
  checkInStatus?: CheckInStatus;
  checkInTime?: Date;
}

const MyEntriesPage: React.FC = () => {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<MyEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<MyEntry[]>([]);
  const [selectedTab, setSelectedTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInDialog, setCheckInDialog] = useState<{
    open: boolean;
    entry: MyEntry | null;
    classEntry: EntryClass | null;
  }>({ open: false, entry: null, classEntry: null });

  // Edit entry dialog state
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    entry: MyEntry | null;
  }>({ open: false, entry: null });

  // Receipt dialog state
  const [receiptDialog, setReceiptDialog] = useState<{
    open: boolean;
    entry: MyEntry | null;
  }>({ open: false, entry: null });

  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'my-entries'
  });

  // Real-time status updates for user's entries
  const { status: entryUpdates } = useStatusUpdates('user_entries', user?.id || '');

  useEffect(() => {
    const fetchEntries = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error: fetchError } = await getUserEntries(user.id);

        if (fetchError) {
          logger.error('Failed to load entries:', 'pages', {}, fetchError as Error);
          setEntries([]);
          return;
        }

        // Transform database entries to MyEntry format
        const userEntries: MyEntry[] = data.map((entry) => {
          const firstClass = entry.entry_classes?.[0];
          return {
            id: entry.id,
            showId: entry.show_id || '',
            showName: firstClass?.classes?.trial?.show?.name || 'Unknown Show',
            showDate: firstClass?.classes?.trial?.date || new Date().toISOString(),
            showLocation: firstClass?.classes?.trial?.show?.location || 'Unknown Location',
            dogId: entry.dog_id || '',
            dogName: entry.dog?.name || 'Unknown Dog',
            breedName: entry.dog?.breed || 'Unknown Breed',
            handler: entry.handler || user?.email || '',
            classes: entry.entry_classes?.map((ec) => ({
              id: ec.id,
              name: ec.classes?.name || 'Unknown Class',
              number: ec.classes?.class_number || '',
              fee: ec.classes?.entry_fee || 0,
              jumpHeight: ec.jump_height || undefined,
              runOrder: ec.run_order || undefined,
              status: (ec.status || 'entered') as 'entered' | 'scratched' | 'moved' | 'absent'
            })) || [],
            status: entry.status as 'pending' | 'confirmed' | 'waitlisted' | 'cancelled',
            totalFees: entry.total_fees || 0,
            paymentStatus: (entry.payment_status || 'pending') as 'pending' | 'paid' | 'refunded',
            createdAt: entry.created_at || new Date().toISOString(),
          };
        });

        setEntries(userEntries);
      } catch (err) {
        logger.error('Error loading entries:', 'pages', {}, err as Error);
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEntries();
    auditService.log({
      action: AuditAction.READ,
      entityType: 'my_entries',
      entityId: user?.id || 'unknown',
      metadata: {
        page: 'my_entries',
        loadTime: new Date().toISOString()
      }
    });
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (entryUpdates) {
      handleEntryUpdate(entryUpdates as { type: string; entryId: string; changes: Record<string, unknown> });
    }
  }, [entryUpdates]);

  const loadMyEntries = async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await getUserEntries(user.id);

      if (error) {
        logger.error('Failed to load entries:', 'pages', {}, error as Error);
        setEntries([]);
        return;
      }

      // Transform database entries to MyEntry format
      const userEntries: MyEntry[] = data.map((entry) => {
        // Type assertions for nested objects
        const dog = entry.dog as { id: string; name: string; call_name?: string } | null;
        const show = entry.show as {
          id: string;
          name: string;
          start_date: string;
          venue?: string;
          city?: string;
          state?: string;
        } | null;
        const classEntries = (entry.class_entry || []) as Array<{
          id: string;
          class_id: string;
          armband?: string;
          run_order?: number;
          jump_height?: string;
          entry_fee?: number;
          status?: string;
          class?: { id: string; name: string; class_number?: string } | null;
        }>;

        // Map class entries to EntryClass format
        const classes: EntryClass[] = classEntries.map((ce) => ({
          id: ce.id,
          name: ce.class?.name || 'Unknown Class',
          number: ce.class?.class_number || '',
          fee: ce.entry_fee || 0,
          jumpHeight: ce.jump_height,
          runOrder: ce.run_order,
          status: mapClassEntryStatus(ce.status),
          checkInStatus: undefined, // Check-in status would come from a separate table
        }));

        // Map entry status
        const entryStatus = mapEntryStatus(entry.entry_status);
        const paymentStatus = mapPaymentStatus(entry.payment_status);

        return {
          id: entry.id,
          registrationId: entry.id,
          showId: show?.id || '',
          showName: show?.name || 'Unknown Show',
          showDate: new Date(show?.start_date || Date.now()),
          location: {
            venue: show?.venue || '',
            city: show?.city || '',
            state: show?.state || '',
          },
          dogName: dog?.call_name || dog?.name || 'Unknown Dog',
          dogId: dog?.id || '',
          classes,
          totalFee: entry.total_fees || classes.reduce((sum, c) => sum + c.fee, 0),
          entryStatus,
          paymentStatus,
          registrationNumber: undefined,
          confirmationNumber: entry.id.slice(0, 8).toUpperCase(),
          submittedAt: new Date(entry.submitted_at || entry.created_at),
          lastUpdated: new Date(entry.updated_at),
        };
      });

      setEntries(userEntries);
    } catch (error) {
      logger.error('Failed to load entries:', 'pages', {}, error as Error);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to map database entry status to EntryStatus enum
  const mapEntryStatus = (status?: string | null): EntryStatus => {
    switch (status) {
      case 'submitted':
        return EntryStatus.PENDING;
      case 'accepted':
        return EntryStatus.ACCEPTED;
      case 'rejected':
        return EntryStatus.REJECTED;
      case 'withdrawn':
        return EntryStatus.CANCELLED;
      default:
        return EntryStatus.PENDING;
    }
  };

  // Helper function to map database payment status to PaymentStatus enum
  const mapPaymentStatus = (status?: string | null): PaymentStatus => {
    switch (status) {
      case 'paid':
        return PaymentStatus.PAID_ONLINE;
      case 'refunded':
        return PaymentStatus.REFUNDED;
      case 'pending':
      default:
        return PaymentStatus.PENDING;
    }
  };

  // Helper function to map class entry status
  const mapClassEntryStatus = (status?: string): 'entered' | 'scratched' | 'moved' | 'absent' => {
    switch (status) {
      case 'withdrawn':
        return 'scratched';
      case 'rejected':
        return 'absent';
      default:
        return 'entered';
    }
  };

  const handleEntryUpdate = (update: { type: string; entryId: string; changes: Record<string, unknown> }) => {
    if (update.type === 'entry_status_change' || update.type === 'payment_status_change') {
      // Update specific entry
      setEntries(prev => prev.map(entry =>
        entry.id === update.entryId
          ? { ...entry, ...update.changes, lastUpdated: new Date() }
          : entry
      ));
    }
  };

  const refreshEntries = async () => {
    setRefreshing(true);
    await loadMyEntries();
    setRefreshing(false);
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
      auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'class_entry',
        entityId: classEntry.id,
        changes: {
          checkInStatus: { from: classEntry.checkInStatus || 'none', to: status }
        },
        metadata: {
          action: 'exhibitor_check_in',
          userId: user?.id,
          entryId: entry.id,
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


  const applyTabFilter = useCallback(() => {
    let filtered = [...entries];

    switch (selectedTab) {
      case 'pending':
        filtered = filtered.filter(entry => 
          entry.entryStatus === EntryStatus.PENDING || 
          entry.paymentStatus === PaymentStatus.PENDING
        );
        break;
      case 'accepted':
        filtered = filtered.filter(entry => entry.entryStatus === EntryStatus.ACCEPTED);
        break;
      case 'waitlist':
        filtered = filtered.filter(entry => entry.entryStatus === EntryStatus.WAITLIST);
        break;
      case 'upcoming': {
        const now = new Date();
        filtered = filtered.filter(entry => 
          entry.showDate >= now && 
          entry.entryStatus === EntryStatus.ACCEPTED
        );
        break;
      }
      default:
        // 'all' - no additional filtering
        break;
    }

    // Sort by show date
    filtered.sort((a, b) => a.showDate.getTime() - b.showDate.getTime());

    setFilteredEntries(filtered);
  }, [entries, selectedTab]);

  useEffect(() => {
    applyTabFilter();
  }, [applyTabFilter]);

  // Memoize computed stats to avoid recalculating on every render
  const entryStats = useMemo(() => {
    const now = new Date();
    const accepted = entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED);
    const pending = entries.filter(e => e.entryStatus === EntryStatus.PENDING);
    const upcoming = entries.filter(e => e.showDate >= now);
    const paidEntries = entries.filter(e => e.paymentStatus !== PaymentStatus.PENDING);
    const unpaidEntries = entries.filter(e => e.paymentStatus === PaymentStatus.PENDING);
    const acceptedPaid = accepted.filter(e => e.paymentStatus !== PaymentStatus.PENDING);
    const acceptedUnpaid = accepted.filter(e => e.paymentStatus === PaymentStatus.PENDING);
    const needsAction = entries.filter(e =>
      e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING
    );

    const totalFees = entries.reduce((sum, entry) => sum + entry.totalFee, 0);
    const paidFees = paidEntries.reduce((sum, e) => sum + e.totalFee, 0);
    const unpaidFees = unpaidEntries.reduce((sum, e) => sum + e.totalFee, 0);

    return {
      total: entries.length,
      accepted: accepted.length,
      pending: pending.length,
      upcoming: upcoming.length,
      acceptedPaid: acceptedPaid.length,
      acceptedUnpaid: acceptedUnpaid.length,
      needsAction: needsAction.length,
      totalFees,
      paidFees,
      unpaidFees,
      acceptedPercent: entries.length > 0 ? Math.round((accepted.length / entries.length) * 100) : 0,
      paidPercent: totalFees > 0 ? Math.round((paidFees / totalFees) * 100) : 0,
      needsActionPercent: entries.length > 0 ? Math.round((needsAction.length / entries.length) * 100) : 0,
    };
  }, [entries]);

  const getEntryStatusBadge = (status: EntryStatus) => {
    switch (status) {
      case EntryStatus.ACCEPTED:
        return (
          <Badge className="bg-success-green/10 text-success-green border-success-green/20 border">
            Accepted
          </Badge>
        );
      case EntryStatus.PENDING:
        return (
          <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 border">
            Pending Review
          </Badge>
        );
      case EntryStatus.WAITLIST:
        return (
          <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 border">
            Waitlist
          </Badge>
        );
      case EntryStatus.REJECTED:
        return (
          <Badge className="bg-error-red/10 text-error-red border-error-red/20 border">
            Rejected
          </Badge>
        );
      case EntryStatus.CANCELLED:
        return (
          <Badge className="bg-muted text-muted-foreground border-border border">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border border">
            Unknown
          </Badge>
        );
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID_ONLINE:
      case PaymentStatus.PAID_BY_CHECK:
      case PaymentStatus.PAID_BY_CASH:
        return (
          <Badge className="bg-success-green/10 text-success-green border-success-green/20 border">
            Paid
          </Badge>
        );
      case PaymentStatus.PENDING:
        return (
          <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 border">
            Payment Due
          </Badge>
        );
      case PaymentStatus.REFUNDED:
      case PaymentStatus.PARTIAL_REFUND:
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20 border">
            Refunded
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border border">
            Unknown
          </Badge>
        );
    }
  };

  const getStatusIcon = (entryStatus: EntryStatus, paymentStatus: PaymentStatus) => {
    if (entryStatus === EntryStatus.ACCEPTED && paymentStatus !== PaymentStatus.PENDING) {
      return <CheckCircle2 className="h-5 w-5 text-[#34C759]" />;
    }
    if (entryStatus === EntryStatus.REJECTED || entryStatus === EntryStatus.CANCELLED) {
      return <XCircle className="h-5 w-5 text-[#FF3B30]" />;
    }
    if (entryStatus === EntryStatus.PENDING || paymentStatus === PaymentStatus.PENDING) {
      return <AlertCircle className="h-5 w-5 text-[#FF9500]" />;
    }
    return <Clock className="h-5 w-5 text-[#007AFF]" />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-20 max-w-7xl">
          <div className="grid gap-8">
            <div className="h-8 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-12 bg-muted/50 rounded-lg animate-pulse" />
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        <div className="space-y-8">
          {/* Breadcrumb */}
          <Breadcrumb 
            items={breadcrumbItems} 
            showHomeIcon={true}
            className="apple-breadcrumb"
          />

          {/* Header */}
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-2">
              <h1 className="apple-show-title">
                My Entries
              </h1>
              <p className="apple-show-subtitle">
                Track and manage your show entries
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                asChild
                className="bg-gradient-to-r from-primary to-[#5856D6] text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <Link to="/shows/browse">
                  <Plus className="h-4 w-4 mr-2" />
                  Enter a Show
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={refreshEntries}
                disabled={refreshing}
                className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Summary Stats - Apple Style */}
          <div className="apple-show-stats-section">
            <div className="apple-show-stats-grid">
              <div className="apple-show-stat-card">
                <div className="apple-show-stat-layout">
                  <div className="apple-show-stat-icon entries">
                    <Users className="w-5 h-5" />
                  </div>

                  <div className="apple-show-stat-content">
                    <div className="apple-show-stat-header">
                      <div className="apple-show-stat-title">Total Entries</div>
                    </div>
                    <div className="apple-show-stat-number">{entries.length}</div>
                  </div>
                </div>

                <div className="apple-show-stat-details">
                  <span>Active: {entryStats.accepted}</span>
                  <span>{entryStats.upcoming} upcoming</span>
                </div>

                <div className="apple-show-stat-progress">
                  <div
                    className="apple-show-stat-progress-bar entries"
                    style={{ width: `${entryStats.acceptedPercent}%` }}
                  ></div>
                </div>
              </div>

              <div className="apple-show-stat-card">
                <div className="apple-show-stat-layout">
                  <div className="apple-show-stat-icon judges">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>

                  <div className="apple-show-stat-content">
                    <div className="apple-show-stat-header">
                      <div className="apple-show-stat-title">Accepted</div>
                    </div>
                    <div className="apple-show-stat-number">
                      {entryStats.accepted}
                    </div>
                  </div>
                </div>

                <div className="apple-show-stat-details">
                  <span>Ready to compete</span>
                  <span>{entryStats.acceptedPaid} paid</span>
                </div>

                <div className="apple-show-stat-progress">
                  <div
                    className="apple-show-stat-progress-bar judges"
                    style={{ width: `${entryStats.acceptedPercent}%` }}
                  ></div>
                </div>
              </div>

              <div className="apple-show-stat-card">
                <div className="apple-show-stat-layout">
                  <div className="apple-show-stat-icon qualified">
                    <AlertCircle className="w-5 h-5" />
                  </div>

                  <div className="apple-show-stat-content">
                    <div className="apple-show-stat-header">
                      <div className="apple-show-stat-title">Needs Action</div>
                    </div>
                    <div className="apple-show-stat-number">
                      {entryStats.needsAction}
                    </div>
                  </div>
                </div>

                <div className="apple-show-stat-details">
                  <span>{entryStats.pending} awaiting review</span>
                  <span>{entryStats.acceptedUnpaid} payment due</span>
                </div>

                <div className="apple-show-stat-progress">
                  <div
                    className="apple-show-stat-progress-bar qualified"
                    style={{ width: `${entryStats.needsActionPercent}%` }}
                  ></div>
                </div>
              </div>

              <div className="apple-show-stat-card">
                <div className="apple-show-stat-layout">
                  <div className="apple-show-stat-icon trials">
                    <DollarSign className="w-5 h-5" />
                  </div>

                  <div className="apple-show-stat-content">
                    <div className="apple-show-stat-header">
                      <div className="apple-show-stat-title">Total Fees</div>
                    </div>
                    <div className="apple-show-stat-number">
                      ${entryStats.totalFees}
                    </div>
                  </div>
                </div>

                <div className="apple-show-stat-details">
                  <span>${entryStats.paidFees} paid</span>
                  <span>${entryStats.unpaidFees} pending</span>
                </div>

                <div className="apple-show-stat-progress">
                  <div
                    className="apple-show-stat-progress-bar trials"
                    style={{ width: `${entryStats.paidPercent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Entries List */}
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
            <TabsList className="flex w-full overflow-x-auto scrollbar-hide bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 h-auto gap-1">
              <TabsTrigger
                value="all"
                className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4"
              >
                Pending
              </TabsTrigger>
              <TabsTrigger
                value="accepted"
                className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4"
              >
                Accepted
              </TabsTrigger>
              <TabsTrigger
                value="waitlist"
                className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4"
              >
                Waitlist
              </TabsTrigger>
              <TabsTrigger
                value="upcoming"
                className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4"
              >
                Upcoming
              </TabsTrigger>
            </TabsList>

            <TabsContent value={selectedTab} className="space-y-4">
              {filteredEntries.length === 0 ? (
                <div className="apple-entries-card text-center">
                  <div className="bg-muted/50 rounded-full p-6 mb-4 inline-block">
                    <Calendar className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No entries found</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    {selectedTab === 'all' 
                      ? "You haven't entered any shows yet" 
                      : `No entries match the ${selectedTab} filter`
                    }
                  </p>
                  <Button 
                    asChild
                    className="bg-gradient-to-r from-primary to-[#5856D6] text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <Link to="/shows/browse">Browse All Shows</Link>
                  </Button>
                </div>
          ) : (
              filteredEntries.map((entry) => (
                <div key={entry.id} className="apple-entries-card">
                  <div className="apple-entries-card-header">
                    <div>
                      <div className="apple-entries-card-title">
                        {getStatusIcon(entry.entryStatus, entry.paymentStatus)}
                        {entry.showName}
                      </div>
                      <div className="apple-entries-card-subtitle">
                        {entry.dogName} • Registration #{entry.registrationNumber || 'Pending'}
                      </div>
                    </div>
                    <div className="apple-entries-badges">
                      {getEntryStatusBadge(entry.entryStatus)}
                      {getPaymentStatusBadge(entry.paymentStatus)}
                    </div>
                  </div>

                  {/* Status Stepper */}
                  <div className="py-4 px-1">
                    <EntryStatusStepper
                      entryStatus={entry.entryStatus}
                      paymentStatus={entry.paymentStatus}
                    />
                  </div>

                  {/* Show Details */}
                  <div className="apple-entries-details-grid">
                    <div className="apple-entries-detail-item">
                      <Calendar className="h-4 w-4" />
                      <span>{entry.showDate.toLocaleDateString()}</span>
                    </div>
                    
                    <div className="apple-entries-detail-item">
                      <MapPin className="h-4 w-4" />
                      <span>{entry.location.city}, {entry.location.state}</span>
                    </div>
                    
                    <div className="apple-entries-detail-item">
                      <DollarSign className="h-4 w-4" />
                      <span>${entry.totalFee} total</span>
                    </div>
                  </div>

                  {/* Classes */}
                  <div className="apple-entries-classes-section">
                    <h5 className="apple-entries-classes-title">Classes Entered:</h5>
                    <div className="apple-entries-classes-grid">
                      {entry.classes.map((cls) => (
                        <div key={cls.id} className="apple-entries-class-item">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="apple-entries-class-name">
                              {cls.name} #{cls.number}
                              {cls.jumpHeight && ` (${cls.jumpHeight})`}
                            </span>
                            
                            {/* Check-in Status Controls */}
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
                          <span className="apple-entries-class-fee">${cls.fee}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="apple-entries-actions">
                    <div className="apple-entries-last-updated">
                      {/* Context-aware status message */}
                      {(() => {
                        const showDate = new Date(entry.showDate);
                        const daysUntilShow = differenceInDays(showDate, new Date());

                        // Show is today or tomorrow - highlight check-in
                        if (isToday(showDate)) {
                          return <span className="text-primary font-medium">Show is today!</span>;
                        }
                        if (isTomorrow(showDate)) {
                          return <span className="text-primary">Show is tomorrow</span>;
                        }

                        // Upcoming show within a week
                        if (daysUntilShow > 0 && daysUntilShow <= 7) {
                          return <span>Show in {daysUntilShow} days</span>;
                        }

                        // Status-based messaging
                        if (entry.entryStatus === EntryStatus.ACCEPTED && entry.paymentStatus === PaymentStatus.PENDING) {
                          return <span className="text-warning-orange">Payment pending since {format(entry.submittedAt, 'MMM d')}</span>;
                        }

                        if (entry.entryStatus === EntryStatus.ACCEPTED) {
                          return <span className="text-success-green">Accepted {formatDistanceToNow(entry.lastUpdated, { addSuffix: true })}</span>;
                        }

                        if (entry.entryStatus === EntryStatus.PENDING) {
                          return <span>Submitted {formatDistanceToNow(entry.submittedAt, { addSuffix: true })}</span>;
                        }

                        // Default fallback
                        return <span>Updated {formatDistanceToNow(entry.lastUpdated, { addSuffix: true })}</span>;
                      })()}
                    </div>
                    <div className="apple-entries-action-buttons">
                      <Button
                        variant="outline"
                        asChild
                        className="min-h-[44px] border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200"
                      >
                        <Link to={`/shows/${entry.showId}`}>
                          <Eye className="h-5 w-5 mr-1.5" />
                          View Show
                        </Link>
                      </Button>

                      {(entry.entryStatus === EntryStatus.PENDING || entry.entryStatus === EntryStatus.ACCEPTED) && (
                        <Button
                          variant="outline"
                          onClick={() => setEditDialog({ open: true, entry })}
                          className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
                        >
                          <Edit className="h-5 w-5 mr-1.5" />
                          Edit Entry
                        </Button>
                      )}

                      {entry.confirmationNumber && (
                        entry.paymentStatus === PaymentStatus.PAID_ONLINE ||
                        entry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
                        entry.paymentStatus === PaymentStatus.PAID_BY_CASH
                      ) && (
                        <Button
                          variant="outline"
                          onClick={() => setReceiptDialog({ open: true, entry })}
                          className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
                        >
                          <Download className="h-5 w-5 mr-1.5" />
                          Receipt
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
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
            armband: checkInDialog.entry.confirmationNumber || checkInDialog.entry.id,
            dogName: checkInDialog.entry.dogName,
            handlerName: user?.email || 'Handler',
            className: checkInDialog.classEntry.name,
            classNumber: checkInDialog.classEntry.number
          }}
          onUpdateStatus={handleCheckInStatusUpdate}
          readOnly={false}
          userRole="exhibitor"
        />
      )}

      {/* Entry Edit Dialog */}
      {editDialog.entry && (
        <EntryEditDialog
          open={editDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setEditDialog({ open: false, entry: null });
            }
          }}
          entry={{
            id: editDialog.entry.id,
            showId: editDialog.entry.showId,
            showName: editDialog.entry.showName,
            dogName: editDialog.entry.dogName,
            classes: editDialog.entry.classes,
          }}
          onUpdate={() => {
            loadMyEntries();
            setEditDialog({ open: false, entry: null });
          }}
        />
      )}

      {/* Entry Receipt Dialog */}
      {receiptDialog.entry && (
        <EntryReceipt
          open={receiptDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setReceiptDialog({ open: false, entry: null });
            }
          }}
          entry={{
            id: receiptDialog.entry.id,
            confirmationNumber: receiptDialog.entry.confirmationNumber || receiptDialog.entry.id.slice(0, 8).toUpperCase(),
            showName: receiptDialog.entry.showName,
            showDate: receiptDialog.entry.showDate,
            location: receiptDialog.entry.location,
            dogName: receiptDialog.entry.dogName,
            classes: receiptDialog.entry.classes,
            totalFee: receiptDialog.entry.totalFee,
            submittedAt: receiptDialog.entry.submittedAt,
            paymentStatus: receiptDialog.entry.paymentStatus === PaymentStatus.PAID_ONLINE ||
                          receiptDialog.entry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
                          receiptDialog.entry.paymentStatus === PaymentStatus.PAID_BY_CASH
                          ? 'Paid' : 'Pending',
          }}
          exhibitorName={user?.email?.split('@')[0]}
          exhibitorEmail={user?.email}
        />
      )}
    </div>
  );
};

export default MyEntriesPage;