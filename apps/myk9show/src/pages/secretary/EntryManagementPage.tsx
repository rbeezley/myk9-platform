import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { auditService } from '@/services/AuditService';
import { UserRole } from '@/types/auth-types';
import { AuditAction } from '@/types/audit-types';
import { EntryStatus } from '@/types/show-registration-types';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import {
  Calendar,
  Users,
  AlertCircle,
  Mail,
  Download,
  Hash,
  Loader2,
  Plus,
  RefreshCw,
  ArrowUpCircle,
  XCircle,
  CheckCircle2,
  List,
  Table2,
} from 'lucide-react';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { ScratchManagementTab } from '@/components/entries/ScratchManagementTab';

// Extracted hooks
import { useEntryManagementData } from '@/hooks/useEntryManagementData';
import { useEntryManagementFilters } from '@/hooks/useEntryManagementFilters';
import { useEntryManagementActions } from '@/hooks/useEntryManagementActions';

// Extracted components
import {
  ArmbandDialog,
  AutoArmbandDialog,
  BulkCheckInDialog,
  EntryStatsCards,
  EntryFiltersCard,
  EntryListCard,
  EntriesTableView,
  CompEntryDialog,
} from '@/components/entries/management';

// Extracted utilities
import { formatDate } from '@/utils/entryManagementUtils';

/**
 * Entry Management Page for show secretaries
 * Refactored as part of DEBT-002 - extracted hooks, components, and utilities
 * Original: 1,428 lines -> Refactored: ~400 lines (72% reduction)
 */
const EntryManagementPage: React.FC = () => {
  const { showId: urlShowId } = useParams<{ showId?: string }>();
  const navigate = useNavigate();

  // Data hook
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
  } = useEntryManagementData(urlShowId);

  // Filter hook
  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    selectedTab,
    setSelectedTab,
    selectedEntries,
    setSelectedEntries,
    handleSelectEntry,
    handleSelectAll,
    filteredEntries,
    clearFilters,
    tabCounts,
  } = useEntryManagementFilters({ entries });

  // Actions hook
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

  // View mode state
  const [entryViewMode, setEntryViewMode] = useState<'list' | 'table'>('list');

  // Comp dialog state
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

  // Audit log page access
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

  // Verify secretary role access
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
          <EntryStatsCards stats={stats} />

          {/* Filters */}
          <EntryFiltersCard
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            paymentFilter={paymentFilter}
            setPaymentFilter={setPaymentFilter}
            onClearFilters={clearFilters}
          />

          {/* Bulk Actions */}
          {selectedEntries.size > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{selectedEntries.size} entries selected</span>
                  <div className="flex gap-2">
                    <Dialog
                      open={bulkActionDialog.open && bulkActionDialog.action === 'status_change'}
                      onOpenChange={open => setBulkActionDialog({ ...bulkActionDialog, open })}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          onClick={() =>
                            setBulkActionDialog({ open: true, action: 'status_change' })
                          }
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
                        <Select
                          onValueChange={value =>
                            handleBulkAction({ type: 'status_change', data: { status: value } })
                          }
                        >
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

          {/* Entries Tabs */}
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <div className="flex items-center justify-between gap-4 mb-2">
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
                <TabsTrigger value="accepted">Accepted ({tabCounts.accepted})</TabsTrigger>
                <TabsTrigger value="waitlist">Waitlist ({tabCounts.waitlist})</TabsTrigger>
                <TabsTrigger value="move-ups">
                  <ArrowUpCircle className="h-4 w-4 mr-1" />
                  Move-Ups
                </TabsTrigger>
                <TabsTrigger value="scratches">
                  <XCircle className="h-4 w-4 mr-1" />
                  Scratches
                </TabsTrigger>
                <TabsTrigger value="issues">Issues ({tabCounts.issues})</TabsTrigger>
              </TabsList>

              <div className="flex bg-muted/50 rounded-lg p-1 flex-shrink-0">
                <Button
                  variant={entryViewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setEntryViewMode('list')}
                  className="h-8 px-2"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={entryViewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setEntryViewMode('table')}
                  className="h-8 px-2"
                >
                  <Table2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <TabsContent value={selectedTab} className="mt-6">
              {entryViewMode === 'table' ? (
                <EntriesTableView entries={filteredEntries} />
              ) : (
                <EntryListCard
                  entries={filteredEntries}
                  selectedEntries={selectedEntries}
                  onSelectEntry={handleSelectEntry}
                  onSelectAll={handleSelectAll}
                  onStatusChange={handleStatusChange}
                  onOpenCheckInDialog={(entry, classEntry) =>
                    setCheckInDialog({ open: true, entry, classEntry })
                  }
                  onOpenArmbandDialog={entry =>
                    setArmbandDialog({ open: true, entry, value: entry.armbandNumber || '' })
                  }
                  onCompEntry={entryId => {
                    const entry = entries.find(e => e.id === entryId);
                    if (entry) {
                      setCompDialog({
                        open: true,
                        entryId,
                        entryNumber: entry.entryNumber,
                        dogName: entry.dogName,
                      });
                    }
                  }}
                  onUncompEntry={handleUncompEntry}
                />
              )}
            </TabsContent>

            {/* Move-Ups Tab Content */}
            <TabsContent value="move-ups" className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  <MoveUpRequestsTab
                    showId={selectedShowId}
                    onRefresh={() => loadEntries(selectedShowId)}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Scratches Tab Content */}
            <TabsContent value="scratches" className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  <ScratchManagementTab
                    showId={selectedShowId}
                    onRefresh={() => loadEntries(selectedShowId)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Check-In Status Dialog */}
          {checkInDialog.entry && checkInDialog.classEntry && (
            <CheckInStatusDialog
              open={checkInDialog.open}
              onOpenChange={open => {
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
                classNumber: checkInDialog.classEntry.number,
              }}
              onUpdateStatus={handleCheckInStatusUpdate}
              readOnly={false}
              userRole="secretary"
            />
          )}
        </>
      )}

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
