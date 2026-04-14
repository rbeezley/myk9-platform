import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WaitlistManagementPage from './WaitlistManagementPage/index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { auditService } from '@/services/AuditService';
import { UserRole } from '@/types/auth-types';
import { AuditAction } from '@/types/audit-types';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import {
  Calendar,
  Users,
  AlertCircle,
  Download,
  Hash,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';

import { useEntryManagementData } from '@/hooks/useEntryManagementData';
import { useEntryManagementFilters } from '@/hooks/useEntryManagementFilters';
import { useEntryManagementActions } from '@/hooks/useEntryManagementActions';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { useClassesByTrialQuery } from '@/hooks/queries/useClassesDatabase';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import {
  ArmbandDialog,
  AutoArmbandDialog,
  BulkCheckInDialog,
  CompEntryDialog,
  FilterBreadcrumb,
  TrialClassFilters,
  TrialRosterView,
  ScoringModeWrapper,
  RegistrationView,
} from '@/components/entries/management';
import { formatDate } from '@/utils/entryManagementUtils';

/**
 * Entry Management Page for show secretaries
 * Refactored as part of DEBT-002 - extracted hooks, components, and utilities
 * Original: 1,428 lines -> Refactored: ~400 lines (72% reduction)
 */
const EntryManagementPage: React.FC = () => {
  const { showId: urlShowId } = useParams<{ showId?: string }>();
  const navigate = useNavigate();
  const [activePageTab] = useUrlTab(['entries', 'waitlist'] as const, 'entries');
  const [, setSearchParams] = useSearchParams();

  // Combined tab + filter reset: switching to waitlist clears trial/class params
  // so returning to entries doesn't unexpectedly re-enter scoring mode.
  const handlePageTabChange = (tab: string) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (tab === 'entries') {
          next.delete('tab');
        } else {
          next.set('tab', tab);
          next.delete('trial');
          next.delete('class');
        }
        return next;
      },
      { replace: true }
    );
  };

  const {
    user,
    hasRole,
    shows,
    selectedShowId,
    setSelectedShowId,
    isLoadingShows,
    entries,
    setEntries,
    isLoading,
    error,
    setError,
    loadEntries,
    stats,
    tabCounts,
  } = useEntryManagementData(urlShowId);

  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    selectedTab,
    setSelectedTab,
    trialFilter,
    classFilter,
    viewMode,
    setTrialFilter,
    setClassFilter,
    selectedEntries,
    setSelectedEntries,
    handleSelectEntry,
    handleSelectAll,
    filteredEntries,
    clearFilters,
  } = useEntryManagementFilters({ entries, tabCounts, showId: selectedShowId });

  const {
    isProcessing,
    checkInDialog,
    setCheckInDialog,
    armbandDialog,
    setArmbandDialog,
    autoArmbandDialog,
    setAutoArmbandDialog,
    bulkActionDialog,
    setBulkActionDialog,
    handleStatusChange,
    handleAssignArmband,
    handleAutoAssignArmbands,
    handleBulkCheckIn,
    handleCheckInStatusUpdate,
    handleBulkAction,
    handleExportCSV,
    handleCompEntry,
    handleUncompEntry,
  } = useEntryManagementActions({
    entries,
    setEntries,
    selectedShowId,
    loadEntries,
    setError,
    selectedEntries,
    setSelectedEntries,
    user,
  });

  const { data: rawTrials = [], isLoading: isLoadingTrials } = useShowTrials(selectedShowId);
  const trials = rawTrials as Array<{
    id: string;
    name: string | null;
    date: string | null;
    trial_number: string | number | null;
  }>;
  const { data: rawTrialClasses = [], isLoading: isLoadingClasses } = useClassesByTrialQuery(
    trialFilter || '',
    !!trialFilter
  );
  const trialClasses = rawTrialClasses as Array<{ id: string; name: string | null }>;
  const { data: trialEntryRows = [], isLoading: isLoadingTrialEntries } = useTrialEntries(
    trialFilter || ''
  );

  const rosterEntries = useMemo(() => {
    if (!trialEntryRows.length) return [];
    return trialEntryRows.map(row => ({
      id: row.id,
      armband: row.armband,
      dogName: row.dog?.call_name || row.dog?.name || 'Unknown Dog',
      breed: row.dog?.breed || null,
      handlerName:
        row.handler ||
        (row.dog?.owner
          ? `${row.dog.owner.first_name || ''} ${row.dog.owner.last_name || ''}`.trim()
          : 'Unknown'),
      className: row.class?.name || 'Unknown Class',
      classId: row.class_id,
      isScored: row.is_scored === true,
      checkInStatus: row.check_in_status || null,
    }));
  }, [trialEntryRows]);

  const [compDialog, setCompDialog] = useState<{
    open: boolean;
    entryId: string;
    entryNumber: string;
    dogName: string;
  }>({
    open: false,
    entryId: '',
    entryNumber: '',
    dogName: '',
  });

  useEffect(() => {
    auditService.log({
      action: AuditAction.READ,
      entityType: 'entry_management',
      entityId: user?.id || 'unknown',
      metadata: {
        page: 'entry_management',
        loadTime: new Date().toISOString(),
      },
    });
  }, [user?.id]);

  if (
    !hasRole(UserRole.SECRETARY) &&
    !hasRole(UserRole.CLUB_ADMIN) &&
    !hasRole(UserRole.SITE_ADMIN)
  ) {
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
            onClick={() => navigate(`/secretary/register/${selectedShowId}`)}
            disabled={!selectedShowId}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Entry
          </Button>
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
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={!selectedShowId || isProcessing}
          >
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
              <SelectValue placeholder={isLoadingShows ? 'Loading shows...' : 'Select a show'}>
                {selectedShowId
                  ? (() => {
                      const show = shows.find(s => s.id === selectedShowId);
                      return show
                        ? `${show.name || 'Unnamed Show'} (${formatDate(show.start_date)})`
                        : undefined;
                    })()
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {shows.map(show => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name || 'Unnamed Show'} ({formatDate(show.start_date)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Page-level tabs: Entries | Waitlist */}
      <Tabs value={activePageTab} onValueChange={handlePageTabChange}>
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
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
            <div className="space-y-6 mt-6">
              {/* Trial / Class Filters */}
              <TrialClassFilters
                trials={trials}
                classes={trialClasses}
                trialFilter={trialFilter}
                classFilter={classFilter}
                onTrialChange={setTrialFilter}
                onClassChange={setClassFilter}
                isLoadingTrials={isLoadingTrials}
                isLoadingClasses={isLoadingClasses}
              />

              {/* Filter Breadcrumb */}
              <FilterBreadcrumb
                trialName={
                  trialFilter
                    ? (() => {
                        const t = trials.find(tr => tr.id === trialFilter);
                        return t ? t.name || `Trial ${t.trial_number}` : null;
                      })()
                    : null
                }
                className={
                  classFilter
                    ? (() => {
                        const c = trialClasses.find(cl => cl.id === classFilter);
                        return c?.name || null;
                      })()
                    : null
                }
                onClearTrial={() => setTrialFilter(null)}
                onClearClass={() => setClassFilter(null)}
              />

              {/* Registration view: stats, filters, bulk actions, entries tabs */}
              {viewMode === 'registration' && (
                <RegistrationView
                  stats={stats}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  paymentFilter={paymentFilter}
                  setPaymentFilter={setPaymentFilter}
                  onClearFilters={clearFilters}
                  selectedEntries={selectedEntries}
                  bulkActionDialog={bulkActionDialog}
                  setBulkActionDialog={setBulkActionDialog}
                  onBulkAction={handleBulkAction}
                  selectedTab={selectedTab}
                  setSelectedTab={setSelectedTab}
                  tabCounts={tabCounts}
                  filteredEntries={filteredEntries}
                  entries={entries}
                  onSelectEntry={handleSelectEntry}
                  onSelectAll={handleSelectAll}
                  onStatusChange={handleStatusChange}
                  onOpenCheckInDialog={(entry, classEntry) =>
                    setCheckInDialog({ open: true, entry, classEntry })
                  }
                  onOpenArmbandDialog={entry =>
                    setArmbandDialog({
                      open: true,
                      entry,
                      value: entry.armbandNumber || '',
                    })
                  }
                  onOpenCompDialog={entry =>
                    setCompDialog({
                      open: true,
                      entryId: entry.id,
                      entryNumber: entry.entryNumber,
                      dogName: entry.dogName,
                    })
                  }
                  onUncompEntry={handleUncompEntry}
                  showId={selectedShowId}
                  onRefresh={() => loadEntries(selectedShowId)}
                />
              )}

              {/* Roster view: trial entries grouped by class */}
              {viewMode === 'roster' && (
                <TrialRosterView
                  entries={rosterEntries}
                  onClassClick={classId => setClassFilter(classId)}
                  isLoading={isLoadingTrialEntries}
                />
              )}

              {viewMode === 'scoring' && classFilter && (
                <ScoringModeWrapper
                  classId={classFilter}
                  showId={selectedShowId}
                  trialId={trialFilter || ''}
                  onBack={() => setClassFilter(null)}
                />
              )}

              {/* Check-In Status Dialog */}
              {checkInDialog.entry && checkInDialog.classEntry && (
                <CheckInStatusDialog
                  open={checkInDialog.open}
                  onOpenChange={open => {
                    if (!open) {
                      setCheckInDialog({ open: false, entry: null, classEntry: null });
                    }
                  }}
                  currentStatus={checkInDialog.classEntry.checkInStatus || 'no-status'}
                  entryInfo={{
                    armband: checkInDialog.entry.armbandNumber || checkInDialog.entry.entryNumber,
                    dogName: checkInDialog.entry.dogName,
                    handlerName: checkInDialog.entry.handlerName,
                    className: checkInDialog.classEntry.name,
                    classNumber: checkInDialog.classEntry.number,
                  }}
                  onUpdateStatus={handleCheckInStatusUpdate}
                  readOnly={false}
                  userRole="secretary"
                />
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="waitlist">
          <WaitlistManagementPage />
        </TabsContent>
      </Tabs>

      {/* Armband Assignment Dialog */}
      <ArmbandDialog
        dialogState={armbandDialog}
        setDialogState={setArmbandDialog}
        onAssign={handleAssignArmband}
        isProcessing={isProcessing}
      />

      {/* Auto-Assign Armbands Dialog */}
      <AutoArmbandDialog
        dialogState={autoArmbandDialog}
        setDialogState={setAutoArmbandDialog}
        onAutoAssign={handleAutoAssignArmbands}
        isProcessing={isProcessing}
      />

      {/* Bulk Check-In Dialog */}
      <BulkCheckInDialog
        dialogState={bulkActionDialog}
        setDialogState={setBulkActionDialog}
        selectedCount={selectedEntries.size}
        onBulkCheckIn={handleBulkCheckIn}
        isProcessing={isProcessing}
      />

      {/* Comp Entry Dialog */}
      <CompEntryDialog
        open={compDialog.open}
        onOpenChange={open => {
          if (!open) setCompDialog({ open: false, entryId: '', entryNumber: '', dogName: '' });
        }}
        entryNumber={compDialog.entryNumber}
        dogName={compDialog.dogName}
        onConfirm={reason => {
          handleCompEntry(compDialog.entryId, reason);
          setCompDialog({ open: false, entryId: '', entryNumber: '', dogName: '' });
        }}
        isProcessing={isProcessing}
      />
    </div>
  );
};

export default EntryManagementPage;
