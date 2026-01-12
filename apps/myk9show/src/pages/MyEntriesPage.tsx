import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
  RefreshCw
} from 'lucide-react';
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

  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'my-entries'
  });

  // Real-time status updates for user's entries
  const { status: entryUpdates } = useStatusUpdates('user_entries', user?.id || '');

  useEffect(() => {
    loadMyEntries();
    auditService.log({
      action: AuditAction.READ,
      entityType: 'my_entries',
      entityId: user?.id || 'unknown',
      metadata: {
        page: 'my_entries',
        loadTime: new Date().toISOString()
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (entryUpdates) {
      handleEntryUpdate(entryUpdates as { type: string; entryId: string; changes: Record<string, unknown> });
    }
  }, [entryUpdates]);

  const loadMyEntries = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call to fetch user's entries from IndexedDB/Supabase
      // const userEntries = await fetchUserEntries(user?.id);
      
      // For now, start with empty array - no mock data
      // All data should come from IndexedDB/database in production
      const userEntries: MyEntry[] = [];
      
      setEntries(userEntries);
    } catch (error) {
      logger.error('Failed to load entries:', 'pages', {}, error as Error);
    } finally {
      setIsLoading(false);
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

  const calculateProgress = (entryStatus: EntryStatus, paymentStatus: PaymentStatus) => {
    if (entryStatus === EntryStatus.ACCEPTED && paymentStatus !== PaymentStatus.PENDING) {
      return 100; // Complete
    }
    if (entryStatus === EntryStatus.ACCEPTED && paymentStatus === PaymentStatus.PENDING) {
      return 75; // Accepted but payment pending
    }
    if (entryStatus === EntryStatus.PENDING) {
      return 50; // Submitted, awaiting review
    }
    if (entryStatus === EntryStatus.WAITLIST) {
      return 60; // On waitlist
    }
    return 25; // Initial submission
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
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <h1 className="apple-show-title">
                My Entries
              </h1>
              <p className="apple-show-subtitle">
                Track and manage your show entries
              </p>
            </div>
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
                      <div className="apple-show-stat-trend">+5%</div>
                    </div>
                    <div className="apple-show-stat-number">{entries.length}</div>
                  </div>
                </div>
                
                <div className="apple-show-stat-details">
                  <span>All time: {entries.length}</span>
                  <span>Active: {entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length}</span>
                </div>
                
                <div className="apple-show-stat-progress">
                  <div 
                    className="apple-show-stat-progress-bar entries"
                    style={{ width: `${entries.length > 0 ? Math.round((entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length / entries.length) * 100) : 0}%` }}
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
                      <div className="apple-show-stat-trend">+12%</div>
                    </div>
                    <div className="apple-show-stat-number">
                      {entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length}
                    </div>
                  </div>
                </div>
                
                <div className="apple-show-stat-details">
                  <span>Ready to compete</span>
                  <span>Confirmed: {entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length}</span>
                </div>
                
                <div className="apple-show-stat-progress">
                  <div 
                    className="apple-show-stat-progress-bar judges"
                    style={{ width: `${entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length > 0 ? 85 : 0}%` }}
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
                      <div className="apple-show-stat-title">Pending</div>
                      <div className="apple-show-stat-trend">-3%</div>
                    </div>
                    <div className="apple-show-stat-number">
                      {entries.filter(e => 
                        e.entryStatus === EntryStatus.PENDING || 
                        e.paymentStatus === PaymentStatus.PENDING
                      ).length}
                    </div>
                  </div>
                </div>
                
                <div className="apple-show-stat-details">
                  <span>Need attention</span>
                  <span>Review required</span>
                </div>
                
                <div className="apple-show-stat-progress">
                  <div 
                    className="apple-show-stat-progress-bar qualified"
                    style={{ width: `${entries.filter(e => e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING).length > 0 ? 60 : 0}%` }}
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
                      <div className="apple-show-stat-title">Total Spent</div>
                      <div className="apple-show-stat-trend">+8%</div>
                    </div>
                    <div className="apple-show-stat-number">
                      ${entries.reduce((sum, entry) => sum + entry.totalFee, 0)}
                    </div>
                  </div>
                </div>
                
                <div className="apple-show-stat-details">
                  <span>Entry fees paid</span>
                  <span>This year: ${entries.reduce((sum, entry) => sum + entry.totalFee, 0)}</span>
                </div>
                
                <div className="apple-show-stat-progress">
                  <div 
                    className="apple-show-stat-progress-bar trials"
                    style={{ width: `${entries.reduce((sum, entry) => sum + entry.totalFee, 0) > 0 ? 70 : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Entries List */}
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 h-auto gap-1">
              <TabsTrigger 
                value="all" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
              >
                All ({entries.length})
              </TabsTrigger>
              <TabsTrigger 
                value="pending"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
              >
                Pending ({entries.filter(e => e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING).length})
              </TabsTrigger>
              <TabsTrigger 
                value="accepted"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
              >
                Accepted ({entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length})
              </TabsTrigger>
              <TabsTrigger 
                value="waitlist"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
              >
                Waitlist ({entries.filter(e => e.entryStatus === EntryStatus.WAITLIST).length})
              </TabsTrigger>
              <TabsTrigger 
                value="upcoming"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
              >
                Upcoming ({entries.filter(e => e.showDate >= new Date() && e.entryStatus === EntryStatus.ACCEPTED).length})
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

                  {/* Progress Section */}
                  <div className="apple-entries-progress-section">
                    <div className="apple-entries-progress-header">
                      <span className="apple-entries-progress-label">Entry Progress</span>
                      <span className="apple-entries-progress-value">{calculateProgress(entry.entryStatus, entry.paymentStatus)}%</span>
                    </div>
                    <Progress 
                      value={calculateProgress(entry.entryStatus, entry.paymentStatus)} 
                      className="h-3 bg-muted"
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
                      Last updated: {entry.lastUpdated.toLocaleDateString()}
                    </div>
                    <div className="apple-entries-action-buttons">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        asChild
                        className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200"
                      >
                        <Link to={`/shows/${entry.showId}`}>
                          <Eye className="h-4 w-4 mr-1" />
                          View Show
                        </Link>
                      </Button>
                      
                      {entry.entryStatus === EntryStatus.PENDING && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          asChild
                          className="hover:bg-muted/50 transition-all duration-200"
                        >
                          <Link to={`/entries/${entry.id}/edit`}>
                            <Edit className="h-4 w-4 mr-1" />
                            Edit Entry
                          </Link>
                        </Button>
                      )}
                      
                      {entry.confirmationNumber && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="hover:bg-muted/50 transition-all duration-200"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
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
    </div>
  );
};

export default MyEntriesPage;