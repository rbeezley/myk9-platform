/**
 * MyEntriesPage
 * User's show entries management page
 * @module pages/MyEntriesPage
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { isPastShowEntry } from './modules/myEntriesStats.helpers';
import { useDogsByOwnerQuery } from '@/hooks/queries/useDogsDatabase';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { ShowTodayBanner } from '@/features/show-today/ShowTodayBanner';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { DogStrip } from '@/components/exhibitor/DogStrip';
import { FirstRunZeroState } from '@/components/exhibitor/FirstRunZeroState';
import {
  buildEntryBalanceRecoveryHref,
  summarizeEntryBalances,
} from '@/features/payments/entryBalanceSummary';
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { AddDogPanel } from '@/components/panels/edit';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import {
  buildResultCardModel,
  buildResultCardVisibility,
  ResultRevealDialog,
  hasSeenResultReveal,
  markResultRevealSeen,
  type ResultCardModel,
} from '@/features/result-card';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import {
  Calendar,
  RefreshCw,
  List,
  Clock,
  CheckCircle,
  Users,
  CalendarDays,
  CircleCheck,
  Calendar as CalendarIcon,
} from 'lucide-react';
import '@/styles/myk9-show-details.css';

const ENTRY_TAB_DEFS = [
  { id: 'all', label: 'All', icon: List },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'accepted', label: 'Accepted', icon: CheckCircle },
  { id: 'waitlist', label: 'Waitlist', icon: Users },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { id: 'completed', label: 'Completed', icon: CircleCheck },
] as const satisfies Omit<PrimaryTabDef, 'count'>[];
import { DashboardGreeting } from '@/components/ui/DashboardGreeting';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { useMyWaitlistEntries } from '@/hooks/queries/useMyWaitlistEntries';
import { useSelfCheckinMap } from '@/hooks/queries/useSelfCheckinEnabled';
import type { WaitListEntry } from '@/types/waitlist-types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useMyEntriesData,
  useMyEntriesFilters,
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
  const checkInMutation = useCheckInMutation({ writer: 'self-checkin-rpc' });
  const { status: syncStatus } = useReplicationSync();

  // Data and filters
  const { entries, isLoading, isError, refreshing, refreshEntries, updateEntryCheckIn } =
    useMyEntriesData({
      persistCheckInStatus: checkInMutation.mutateAsync,
    });
  const { filteredEntries, selectedTab, setSelectedTab, entryStats, tabCounts } =
    useMyEntriesFilters({
      entries,
    });

  // Resolve the secretary's self-check-in cascade (class ?? trial ?? show ?? true)
  // for every entered class. The check-in control should reflect whether the
  // secretary has opened self-check-in — not merely whether the entry is unscored.
  const selfCheckinClassIds = useMemo(
    () =>
      Array.from(
        new Set(
          // Only unscored classes render the gated control, so resolving the
          // cascade for scored/past classes would be wasted DB reads (4 per class).
          entries.flatMap(e =>
            e.classes
              .filter(c => !c.isScored)
              .map(c => c.classId)
              .filter((id): id is string => !!id)
          )
        )
      ),
    [entries]
  );
  const selfCheckinByClassId = useSelfCheckinMap(selfCheckinClassIds);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Resolve the exhibitor's person id from the same source entry loading and the
  // AddDogPanel use (legacy lookup first, then the auth record). Deriving dog
  // ownership from only userWithRoles.databaseUserId would disable the dog query
  // for exhibitors whose id comes from the legacy lookup, making the zero-state
  // wrongly treat them as having no dogs. See useMyEntriesData's personId.
  const currentUserPersonId = useCurrentUserPersonId();
  const ownerId = currentUserPersonId ?? userWithRoles?.databaseUserId ?? '';

  const { data: dogs = [], isLoading: dogsLoading } = useDogsByOwnerQuery(ownerId, !!ownerId);

  // Tri-state dog ownership for the first-run zero-state. Resolving it eagerly
  // off `dogs.length` flashes "Add Your First Dog" at an exhibitor who *does*
  // own dogs while the query is still in flight. So:
  //   - no ownerId  → the query is disabled and there can be no dogs on file → false
  //   - still loading → ownership unknown → undefined (the CTA stays dog-neutral)
  //   - settled     → the real answer
  // `undefined` is deliberately distinct from `false` so FirstRunZeroState never
  // commits to the no-dogs branch before ownership is known.
  const hasDogs: boolean | undefined = !ownerId ? false : dogsLoading ? undefined : dogs.length > 0;

  const entryTabs = useMemo<PrimaryTabDef[]>(
    () =>
      ENTRY_TAB_DEFS.map(tab => ({
        ...tab,
        count: tabCounts[tab.id],
      })),
    [tabCounts]
  );

  const upcomingClassCountByDog = useMemo(() => {
    const now = new Date();
    return entries.reduce<Record<string, number>>((counts, entry) => {
      if (isPastShowEntry(entry, now)) return counts;
      counts[entry.dogId] = (counts[entry.dogId] ?? 0) + entry.classes.length;
      return counts;
    }, {});
  }, [entries]);

  const isInitialEntriesSyncing =
    entries.length === 0 &&
    areReplicationTablesPendingFirstSync(syncStatus, ['entries', 'dogs', 'classes', 'shows']);

  const currentFeesHref = useMemo(() => {
    return buildEntryBalanceRecoveryHref(summarizeEntryBalances(entries));
  }, [entries]);

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
  const [resultRevealModel, setResultRevealModel] = useState<ResultCardModel | null>(null);
  const [seenResultReleaseKeys, setSeenResultReleaseKeys] = useState<Set<string>>(() => {
    return new Set();
  });

  const [addDogOpen, setAddDogOpen] = useState(false);

  // Waitlist
  const { profile: exhibitorProfile } = useExhibitorProfile();
  const {
    entries: waitlistEntries,
    isLoading: waitlistLoading,
    withdraw,
  } = useMyWaitlistEntries(exhibitorProfile?.id);

  // Handlers — stable identities so the memoized MyEntryCard list doesn't
  // re-render every card when an unrelated dialog opens or a tab changes.
  const handleCheckInClick = useCallback((entry: MyEntry, classEntry: EntryClass) => {
    setCheckInDialog({ open: true, entry, classEntry });
  }, []);

  const handleEditClick = useCallback((entry: MyEntry) => {
    setEditDialog({ open: true, entry });
  }, []);

  const handleReceiptClick = useCallback((entry: MyEntry) => {
    setReceiptDialog({ open: true, entry });
  }, []);

  React.useEffect(() => {
    const keys = new Set<string>();
    for (const entry of entries) {
      for (const cls of entry.classes) {
        const model = buildResultCardModel({
          entry,
          classEntry: cls,
          visibility: buildResultCardVisibility(cls),
        });
        if (model && hasSeenResultReveal(model.releaseKey)) keys.add(model.releaseKey);
      }
    }
    setSeenResultReleaseKeys(keys);
  }, [entries]);

  React.useEffect(() => {
    const resultEntryId = searchParams.get('resultEntryId');
    if (!resultEntryId || resultRevealModel) return;

    for (const entry of entries) {
      const classEntry = entry.classes.find(cls => cls.id === resultEntryId);
      if (!classEntry) continue;
      const model = buildResultCardModel({
        entry,
        classEntry,
        visibility: buildResultCardVisibility(classEntry),
      });
      if (model) {
        setResultRevealModel(model);
        const next = new URLSearchParams(searchParams);
        next.delete('resultEntryId');
        setSearchParams(next, { replace: true });
      }
      break;
    }
  }, [entries, resultRevealModel, searchParams, setSearchParams]);

  const handleCheckInStatusUpdate = async (status: CheckInStatus, notes?: string) => {
    if (!checkInDialog.entry || !checkInDialog.classEntry) return;

    try {
      await updateEntryCheckIn(checkInDialog.entry.id, checkInDialog.classEntry.id, status, notes);
      setCheckInDialog({ open: false, entry: null, classEntry: null });
    } catch {
      // Error handled in hook
    }
  };

  const handleResultRevealSeen = useCallback((releaseKey: string) => {
    markResultRevealSeen(releaseKey);
    setSeenResultReleaseKeys(prev => {
      if (prev.has(releaseKey)) return prev;
      const next = new Set(prev);
      next.add(releaseKey);
      return next;
    });
  }, []);

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
  if (isLoading || isInitialEntriesSyncing) {
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
        {/* Flex stack (not space-y) so the dog strip and the entries section can
            swap order on phones. On mobile the schedule (entries) sits directly
            under the collapsed stats; the dog strip drops below the first fold.
            Desktop keeps source order (dog strip above entries) — INTENT.md
            Exhibitor: "this respects my time". gap-8 == the prior space-y-8. */}
        <div className="flex flex-col gap-8">
          <div className="rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-5 sm:p-6">
            <h1 className="sr-only">My Shows</h1>
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

          {/* Canonical "Show today" entry point into /at-show (auto-favorites
              today's dogs). Replaces a stale ad-hoc card that linked to the
              retired /exhibitor/show-day route. Renders nothing when no show is
              today. This is the surface an entered exhibitor actually lands on,
              since HomeRedirect keeps them off Home (where the banner also mounts). */}
          <ShowTodayBanner />

          {/* First-run zero-state: a brand-new exhibitor with no entries would
              otherwise see all-zero stat cards, an empty dog-strip gap, and an
              empty tab — noise that reads as a data-entry chore. Suppress the
              whole stack and present one calm, adaptive call-to-action instead.
              INTENT: Exhibitor first run must feel frictionless ("respects my
              time"), never like a form to fill. */}
          {entries.length === 0 ? (
            <FirstRunZeroState hasDogs={hasDogs} onAddDog={() => setAddDogOpen(true)} />
          ) : (
            <>
              <CompactStatsRow
                acceptedEntries={entryStats.currentAcceptedEntries}
                pendingEntries={entryStats.currentPendingEntries}
                upcomingShows={entryStats.upcomingShows}
                pastShows={entryStats.pastShows}
                currentFees={entryStats.currentFees}
                amountDue={entryStats.currentAmountDue}
                currentFeesHref={currentFeesHref}
                onNavigate={navigate}
              />

              {/* order-2 on mobile pushes the dog strip below the entries section
                  (which is order-1). On desktop both are order-0, so source order
                  keeps the dog strip above the entries. */}
              <div className="max-[720px]:order-2">
                <DogStrip
                  dogs={
                    (dogs ?? []) as {
                      id: string;
                      call_name?: string;
                      name?: string;
                      registrations?: { breed?: string; organization?: string; status?: string }[];
                    }[]
                  }
                  upcomingClassCountByDog={upcomingClassCountByDog}
                  onAddDog={() => setAddDogOpen(true)}
                />
              </div>

              {/* Entries section — order-1 on mobile lifts the schedule above the dog
                  strip. Label + tabs move as one unit; space-y-8 preserves the prior
                  spacing between them. */}
              <div className="space-y-8 max-[720px]:order-1">
                {/* This branch only renders when entries.length > 0, so the count
                    badge is always shown here. aria-hidden keeps it decorative —
                    the tab counts already convey the number to assistive tech. */}
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  My Entries
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium w-5 h-5"
                  >
                    {entries.length}
                  </span>
                </p>

                {/* Entries List */}
                <PrimaryTabs
                  tabs={entryTabs}
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
                          selfCheckinByClassId={selfCheckinByClassId}
                          onCheckInClick={handleCheckInClick}
                          onEditClick={handleEditClick}
                          onReceiptClick={handleReceiptClick}
                          onResultRevealClick={setResultRevealModel}
                          seenResultReleaseKeys={seenResultReleaseKeys}
                        />
                      ))
                    )}
                  </TabsContent>
                </PrimaryTabs>
              </div>
            </>
          )}
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

      <ResultRevealDialog
        open={resultRevealModel != null}
        onOpenChange={open => {
          if (!open) setResultRevealModel(null);
        }}
        model={resultRevealModel}
        onSeen={handleResultRevealSeen}
      />

      <AddDogPanel
        open={addDogOpen}
        onClose={() => setAddDogOpen(false)}
        onDogCreated={() => setAddDogOpen(false)}
        currentUserPersonId={currentUserPersonId ?? undefined}
      />
    </div>
  );
};

// Sub-components

interface EmptyStateProps {
  selectedTab: string;
}

// Per-tab empty state. The whole-page zero-state (no entries at all) is handled
// upstream by FirstRunZeroState, so by the time this renders the exhibitor has
// entries — just none matching the active filter (e.g. an empty Waitlist tab).
const EmptyState: React.FC<EmptyStateProps> = ({ selectedTab }) => (
  <div className="myk9-entries-card text-center">
    <div className="bg-muted/50 rounded-full p-6 mb-4 inline-block">
      <Calendar className="h-12 w-12 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold mb-2">No entries found</h3>
    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
      No entries match the {selectedTab} filter
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
        armband: dialog.entry.armband,
        confirmationNumber: dialog.entry.confirmationNumber,
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
    ...(c.trialType !== undefined && { trialType: c.trialType }),
    ...(c.handler !== undefined && { handler: c.handler }),
    ...(c.runOrder !== undefined && { runOrder: c.runOrder }),
  }));

  // MyEntriesPage is cross-show (/my-entries spans many shows), so it can't take a
  // single page-level presence boundary. Instead wrap just the open dialog in a
  // per-show ShowPresenceProvider keyed on this entry's show — that makes the
  // exhibitor a presence producer for the relevant show while editing, so the
  // Phase 3 edit-awareness hook/badge inside the dialog have a roster to ride.
  return (
    <ShowPresenceProvider showId={dialog.entry.showId}>
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
    </ShowPresenceProvider>
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
    <Card className="border border-warning/30 bg-warning/10 ">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-warning ">
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
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning text-sm font-semibold">
                    #{entry.position}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.dogName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.className} <span aria-hidden="true">·</span> {entry.showName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.status === 'offered' && (
                    <Badge variant="outline" className="border-success/50 text-success text-xs">
                      Spot Offered
                    </Badge>
                  )}
                  <button
                    onClick={() => onWithdraw(entry.id)}
                    disabled={isWithdrawing}
                    className="inline-flex min-h-[44px] items-center rounded px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
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
