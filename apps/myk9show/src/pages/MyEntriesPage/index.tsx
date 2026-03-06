/**
 * MyEntriesPage
 * User's show entries management page
 * @module pages/MyEntriesPage
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import { Calendar, RefreshCw, Plus } from 'lucide-react';
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
  const { user } = useAuthContext();

  // Data and filters
  const { entries, isLoading, refreshing, refreshEntries, updateEntryCheckIn } = useMyEntriesData();
  const { filteredEntries, selectedTab, setSelectedTab, entryStats } = useMyEntriesFilters({
    entries,
  });

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
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        <div className="space-y-8">
          <h1 className="sr-only">My Entries</h1>
          {/* Breadcrumb + Actions */}
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
          <Tabs
            value={selectedTab}
            onValueChange={value => setSelectedTab(value as EntryTabFilter)}
            className="space-y-6"
          >
            <TabsList className="flex w-full overflow-x-auto scrollbar-hide bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 h-auto gap-1">
              {['all', 'pending', 'accepted', 'waitlist', 'upcoming', 'completed'].map(tab => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4 capitalize"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

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
          </Tabs>
        </div>
      </div>

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
      currentStatus={dialog.classEntry.checkInStatus || 'none'}
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
        confirmationNumber: entry.confirmationNumber || entry.id.slice(0, 8).toUpperCase(),
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

export default MyEntriesPage;
