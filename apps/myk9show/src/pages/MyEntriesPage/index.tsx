/**
 * MyEntriesPage
 * User's show entries management page
 * @module pages/MyEntriesPage
 */

import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { EntryStatus } from '@/types/show-registration-types';
import { useDogsByOwnerQuery } from '@/hooks/queries/useDogsDatabase';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { DogStrip } from '@/components/exhibitor/DogStrip';
import { PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import {
  Calendar,
  RefreshCw,
  Plus,
  List,
  Clock,
  CheckCircle,
  Users,
  CalendarDays,
  CircleCheck,
  Calendar as CalendarIcon,
  Activity,
  ChevronRight,
} from 'lucide-react';
import '@/styles/myk9-show-details.css';

const ENTRY_TABS: PrimaryTabDef[] = [
  { id: 'all', label: 'All', icon: List },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'accepted', label: 'Accepted', icon: CheckCircle },
  { id: 'waitlist', label: 'Waitlist', icon: Users },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { id: 'completed', label: 'Completed', icon: CircleCheck },
];
import { DashboardGreeting } from '@/components/ui/DashboardGreeting';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { useMyWaitlistEntries } from '@/hooks/queries/useMyWaitlistEntries';
import type { WaitListEntry } from '@/types/waitlist-types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useMyEntriesData,
  useMyEntriesFilters,
  MyEntriesStatsCards,
  MyEntryCard,
  type MyEntry,
  type EntryClass,
  type CheckInDialogState,
  type EditDialogState,
  type ReceiptDialogState,
  type EntryTabFilter,
} from './modules';

const MyEntriesPage: React.FC = () => {
  const { user, userWithRoles, firstName } = useAuthContext();

  // Data and filters
  const { entries, isLoading, isError, refreshing, refreshEntries, updateEntryCheckIn } =
    useMyEntriesData();
  const { filteredEntries, selectedTab, setSelectedTab, entryStats } = useMyEntriesFilters({
    entries,
  });

  const navigate = useNavigate();
  const ownerId = userWithRoles?.databaseUserId ?? '';

  const { data: dogs = [] } = useDogsByOwnerQuery(ownerId, !!ownerId);
  const showDayData = useShowDayData();

  const statistics = useMemo(
    () => ({
      activeEntries: entries.filter((e: MyEntry) => e.entryStatus === EntryStatus.ACCEPTED).length,
      upcomingShows: entries.filter((e: MyEntry) => e.showDate && e.showDate > new Date()).length,
      totalDogs: dogs.length,
    }),
    [entries, dogs]
  );

  // Dialog states
  const [checkInDialog, setCheckInDialog] = useState<CheckInDialogState>({
    open: false,
    entry: null,
    classEntry: null,
  });

  const [editDialog, setEditDialog] = useState<EditDialogState>({
    open: false,
    entry: null,
  });

  const [receiptDialog, setReceiptDialog] = useState<ReceiptDialogState>({
    open: false,
    entry: null,
  });

  // Waitlist
  const { profile: exhibitorProfile } = useExhibitorProfile();
  const {
    entries: waitlistEntries,
    isLoading: waitlistLoading,
    withdraw,
  } = useMyWaitlistEntries(exhibitorProfile?.id);

  // Breadcrumb
  const breadcrumbItems = useBreadcrumb({ currentPage: 'my-entries' });

  // Handlers
  const handleCheckInClick = (entry: MyEntry, classEntry: EntryClass) => {
    setCheckInDialog({ open: true, entry, classEntry });
  };

  const handleEditClick = (entry: MyEntry) => {
    setEditDialog({ open: true, entry });
  };

  const handleReceiptClick = (entry: MyEntry) => {
    setReceiptDialog({ open: true, entry });
  };

  const handleCheckInStatusUpdate = async (status: CheckInStatus, notes?: string) => {
    if (!checkInDialog.entry || !checkInDialog.classEntry) return;

    try {
      await updateEntryCheckIn(checkInDialog.entry.id, checkInDialog.classEntry.id, status, notes);
      setCheckInDialog({ open: false, entry: null, classEntry: null });
    } catch {
      // Error handled in hook
    }
  };

  // Error state
  if (isError && !isLoading) {
    return (
      <div className="bg-background">
        <div className="container mx-auto px-6 py-6 max-w-7xl">
          <div className="myk9-entries-card text-center">
            <p className="text-muted-foreground mb-4">
              Failed to load your entries. Please check your connection.
            </p>
            <Button
              variant="outline"
              onClick={refreshEntries}
              disabled={refreshing}
              className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-background">
        <div className="container mx-auto px-6 py-6 max-w-7xl">
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
      <div className="container mx-auto px-6 py-6 max-w-7xl">
        <div className="space-y-8">
          <div className="rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <DashboardGreeting
                  firstName={firstName}
                  subtitle="Here's what's happening with your shows"
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground"
                />
              </div>
              <Button onClick={() => navigate('/shows')} size="sm">
                <CalendarIcon className="h-4 w-4 mr-2" />
                Enter a Show
              </Button>
            </div>
          </div>

          {showDayData.isShowDay && (
            <Link
              to="/exhibitor/show-day"
              className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 p-4 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 flex-shrink-0">
                <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">You have a show today!</p>
                <p className="text-sm text-muted-foreground">
                  Check in, view run order, and see live results
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </Link>
          )}

          <CompactStatsRow
            activeEntries={statistics.activeEntries}
            upcomingShows={statistics.upcomingShows}
            totalDogs={statistics.totalDogs}
            onNavigate={navigate}
          />

          <DogStrip
            dogs={
              (dogs ?? []) as { id: string; call_name?: string; name?: string; breed?: string }[]
            }
          />

          <div className="flex items-center justify-between">
            <Breadcrumb
              items={breadcrumbItems}
              showHomeIcon={true}
              className="text-sm text-muted-foreground"
            />
            <div className="flex gap-2 flex-shrink-0">
              <Button
                asChild
                className="bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <Link to="/shows">
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

          {/* Summary Stats */}
          <MyEntriesStatsCards stats={entryStats} />

          {/* Entries List */}
          <PrimaryTabs
            tabs={ENTRY_TABS}
            value={selectedTab}
            onValueChange={value => setSelectedTab(value as EntryTabFilter)}
            className="space-y-6"
          >

            <TabsContent value={selectedTab} className="space-y-4">
              {filteredEntries.length === 0 ? (
                <EmptyState selectedTab={selectedTab} />
              ) : (
                filteredEntries.map(entry => (
                  <MyEntryCard
                    key={entry.id}
                    entry={entry}
                    onCheckInClick={handleCheckInClick}
                    onEditClick={handleEditClick}
                    onReceiptClick={handleReceiptClick}
                  />
                ))
              )}
            </TabsContent>
          </PrimaryTabs>
        </div>
      </div>

      {/* Wait List Queue */}
      {(waitlistLoading || waitlistEntries.length > 0) && (
        <WaitListSection
          entries={waitlistEntries}
          isLoading={waitlistLoading}
          onWithdraw={id => withdraw.mutate(id)}
          isWithdrawing={withdraw.isPending}
        />
      )}

      {/* Dialogs */}
      <CheckInDialog
        dialog={checkInDialog}
        user={user}
        onClose={() => setCheckInDialog({ open: false, entry: null, classEntry: null })}
        onUpdateStatus={handleCheckInStatusUpdate}
      />

      <EditEntryDialog
        dialog={editDialog}
        onClose={() => setEditDialog({ open: false, entry: null })}
        onUpdate={async () => {
          await refreshEntries();
          setEditDialog({ open: false, entry: null });
        }}
      />

      <ReceiptEntryDialog
        dialog={receiptDialog}
        user={user}
        onClose={() => setReceiptDialog({ open: false, entry: null })}
      />
    </div>
  );
};

// Sub-components

interface EmptyStateProps {
  selectedTab: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ selectedTab }) => (
  <div className="myk9-entries-card text-center">
    <div className="bg-muted/50 rounded-full p-6 mb-4 inline-block">
      <Calendar className="h-12 w-12 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold mb-2">No entries found</h3>
    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
      {selectedTab === 'all'
        ? "You haven't entered any shows yet"
        : `No entries match the ${selectedTab} filter`}
    </p>
    <Button
      asChild
      className="bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      <Link to="/shows">Browse All Shows</Link>
    </Button>
  </div>
);

interface CheckInDialogProps {
  dialog: CheckInDialogState;
  user: { email?: string; id?: string } | null;
  onClose: () => void;
  onUpdateStatus: (status: CheckInStatus, notes?: string) => Promise<void>;
}

const CheckInDialog: React.FC<CheckInDialogProps> = ({ dialog, user, onClose, onUpdateStatus }) => {
  if (!dialog.entry || !dialog.classEntry) return null;

  return (
    <CheckInStatusDialog
      open={dialog.open}
      onOpenChange={open => !open && onClose()}
      currentStatus={dialog.classEntry.checkInStatus || 'no-status'}
      entryInfo={{
        armband: dialog.entry.confirmationNumber || dialog.entry.id,
        dogName: dialog.entry.dogName,
        handlerName: user?.email || 'Handler',
        className: dialog.classEntry.name,
        classNumber: dialog.classEntry.number,
      }}
      onUpdateStatus={onUpdateStatus}
      readOnly={false}
      userRole="exhibitor"
    />
  );
};

interface EditEntryDialogProps {
  dialog: EditDialogState;
  onClose: () => void;
  onUpdate: () => void;
}

const EditEntryDialog: React.FC<EditEntryDialogProps> = ({ dialog, onClose, onUpdate }) => {
  if (!dialog.entry) return null;

  // Map classes to match EntryEditDialog's expected type
  const mappedClasses = dialog.entry.classes.map(c => ({
    id: c.id,
    name: c.name,
    number: c.number,
    fee: c.fee,
    status: c.status,
    ...(c.jumpHeight !== undefined && { jumpHeight: c.jumpHeight }),
    ...(c.runOrder !== undefined && { runOrder: c.runOrder }),
  }));

  return (
    <EntryEditDialog
      open={dialog.open}
      onOpenChange={open => !open && onClose()}
      entry={{
        id: dialog.entry.id,
        showId: dialog.entry.showId,
        showName: dialog.entry.showName,
        dogName: dialog.entry.dogName,
        classes: mappedClasses,
      }}
      onUpdate={onUpdate}
    />
  );
};

interface ReceiptEntryDialogProps {
  dialog: ReceiptDialogState;
  user: { email?: string; user_metadata?: Record<string, string> } | null;
  onClose: () => void;
}

const ReceiptEntryDialog: React.FC<ReceiptEntryDialogProps> = ({ dialog, user, onClose }) => {
  if (!dialog.entry) return null;

  const entry = dialog.entry;
  const isPaid =
    entry.paymentStatus === PaymentStatus.PAID_ONLINE ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CASH;

  const exhibitorName = user?.user_metadata?.full_name || user?.email?.split('@')[0];
  const exhibitorEmail = user?.email;

  // Map classes to match EntryReceipt's expected type
  const mappedClasses = entry.classes.map(c => ({
    id: c.id,
    name: c.name,
    number: c.number,
    fee: c.fee,
    status: c.status,
    ...(c.jumpHeight !== undefined && { jumpHeight: c.jumpHeight }),
    ...(c.runOrder !== undefined && { runOrder: c.runOrder }),
  }));

  return (
    <EntryReceipt
      open={dialog.open}
      onOpenChange={open => !open && onClose()}
      entry={{
        id: entry.id,
        confirmationNumber: entry.confirmationNumber ?? entry.id.slice(0, 8).toUpperCase(),
        showName: entry.showName,
        showDate: entry.showDate,
        location: entry.location,
        dogName: entry.dogName,
        classes: mappedClasses,
        totalFee: entry.totalFee,
        submittedAt: entry.submittedAt,
        paymentStatus: isPaid ? 'Paid' : 'Pending',
      }}
      {...(exhibitorName && { exhibitorName })}
      {...(exhibitorEmail && { exhibitorEmail })}
    />
  );
};

interface WaitListSectionProps {
  entries: WaitListEntry[];
  isLoading: boolean;
  onWithdraw: (id: string) => void;
  isWithdrawing: boolean;
}

const WaitListSection: React.FC<WaitListSectionProps> = ({
  entries,
  isLoading,
  onWithdraw,
  isWithdrawing,
}) => (
  <div className="container mx-auto px-6 pb-4 max-w-7xl">
    <Card className="border border-amber-200/50 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-amber-800 dark:text-amber-300">
          <Users className="h-4 w-4" />
          My Wait List Positions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active wait list positions.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/60 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-sm font-semibold">
                    #{entry.position}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.dogName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.className} — {entry.showName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.status === 'offered' && (
                    <Badge
                      variant="outline"
                      className="border-green-500/50 text-green-700 dark:text-green-400 text-xs"
                    >
                      Spot Offered
                    </Badge>
                  )}
                  <button
                    onClick={() => onWithdraw(entry.id)}
                    disabled={isWithdrawing}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors duration-150 disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  </div>
);

export default MyEntriesPage;
