/**
 * ShowBulkActionsBar — the Managing tab's floating bulk-action bar
 * (list-toolkit rollout, MYK9-798): Mark completed, Mark cancelled, Export,
 * Delete. Composes the shared `FloatingBulkBar`/`BulkBarButton` for the
 * floating shell; the dispatch (updateShow/deleteShow) and confirmation
 * dialogs below are unchanged from the page's original bar.
 */

import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { updateShow, deleteShow } from '@/services/database/shows';
import { Trash2, AlertCircle, Download, XCircle, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

// Must stay in sync with the shows_status_check CHECK constraint
// (migration 072): draft | published | upcoming | in_progress | completed | cancelled.
// 'published' is deliberately absent: publishing opens online entries and must
// go through the Stripe-payouts gate (onlineEntryGate), which is per-club —
// a bulk write can't evaluate it. Publish from the show's own status pill.
type ShowStatus = 'completed' | 'cancelled';
type DialogType = 'status' | 'export' | 'delete' | null;

interface ShowBulkActionsBarProps {
  selectedShows: EnhancedShow[];
  onClearSelection: () => void;
  onBulkComplete: () => void;
}

const STATUS_OPTIONS: { value: ShowStatus; label: string; icon: React.ElementType }[] = [
  { value: 'completed', label: 'Mark Completed', icon: CalendarCheck },
  { value: 'cancelled', label: 'Mark Cancelled', icon: XCircle },
];

export const ShowBulkActionsBar: React.FC<ShowBulkActionsBarProps> = ({
  selectedShows,
  onClearSelection,
  onBulkComplete,
}) => {
  const [currentDialog, setCurrentDialog] = useState<DialogType>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ShowStatus>('completed');

  const closeDialog = () => {
    setCurrentDialog(null);
    setError(null);
  };

  const handleBulkStatusChange = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      logger.debug('Bulk show status change', 'shows', {
        action: pendingStatus,
        showIds: selectedShows.map(s => s.id),
      });

      const results = await Promise.all(
        selectedShows.map(show => updateShow(show.id, { status: pendingStatus }))
      );
      const failedCount = results.filter(result => result.error).length;
      if (failedCount === selectedShows.length) {
        setError('Failed to update the selected shows. Please try again.');
        return;
      }
      if (failedCount > 0) {
        // Partial failure: refresh + clear selection so the succeeded subset
        // reflects immediately and a retry can't re-hit already-updated shows.
        notifications.error(`Failed to update ${failedCount} of ${selectedShows.length} shows.`, {
          description: 'The other shows were updated. Re-select the failed shows to retry.',
        });
        closeDialog();
        onBulkComplete();
        return;
      }

      logger.info('Bulk status change complete', 'shows', {
        status: pendingStatus,
        count: selectedShows.length,
      });

      closeDialog();
      onBulkComplete();
    } catch {
      setError('Failed to update show status. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkExport = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      logger.debug('Bulk show export', 'shows', {
        showIds: selectedShows.map(s => s.id),
      });

      // Build CSV content
      const headers = ['Name', 'Organization', 'Start Date', 'End Date', 'Location', 'Status'];
      const rows = selectedShows.map(show => [
        show.name,
        show.organization,
        show.startDate,
        show.endDate,
        show.location,
        show.status,
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shows-export-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      logger.info('Bulk export complete', 'shows', { count: selectedShows.length });

      closeDialog();
      onBulkComplete();
    } catch {
      setError('Failed to export shows. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      logger.debug('Bulk show delete', 'shows', {
        showIds: selectedShows.map(s => s.id),
      });

      const results = await Promise.all(selectedShows.map(show => deleteShow(show.id)));
      const failedCount = results.filter(result => result.error).length;
      if (failedCount === selectedShows.length) {
        setError('Failed to delete the selected shows. Please try again.');
        return;
      }
      if (failedCount > 0) {
        // Partial failure: refresh + clear selection so already-deleted shows
        // drop out of the list and a retry can't re-delete them.
        notifications.error(`Failed to delete ${failedCount} of ${selectedShows.length} shows.`, {
          description: 'The other shows were deleted. Re-select the failed shows to retry.',
        });
        closeDialog();
        onBulkComplete();
        return;
      }

      logger.info('Bulk delete complete', 'shows', { count: selectedShows.length });

      closeDialog();
      onBulkComplete();
    } catch {
      setError('Failed to delete shows. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (selectedShows.length === 0) {
    return null;
  }

  const statusOption = STATUS_OPTIONS.find(o => o.value === pendingStatus);

  return (
    <>
      <FloatingBulkBar
        count={selectedShows.length}
        noun={['show', 'shows']}
        onClear={onClearSelection}
        busy={isProcessing}
      >
        <BulkBarButton
          onClick={() => {
            setPendingStatus('completed');
            setCurrentDialog('status');
          }}
          icon={<CalendarCheck className="h-4 w-4" aria-hidden="true" />}
        >
          Mark completed
        </BulkBarButton>
        <BulkBarButton
          onClick={() => {
            setPendingStatus('cancelled');
            setCurrentDialog('status');
          }}
          icon={<XCircle className="h-4 w-4" aria-hidden="true" />}
        >
          Mark cancelled
        </BulkBarButton>
        <BulkBarButton
          onClick={() => setCurrentDialog('export')}
          icon={<Download className="h-4 w-4" aria-hidden="true" />}
        >
          Export
        </BulkBarButton>
        <BulkBarButton
          onClick={() => setCurrentDialog('delete')}
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          tone="destructive"
        >
          Delete
        </BulkBarButton>
      </FloatingBulkBar>

      {/* Status Change Dialog */}
      <Dialog open={currentDialog === 'status'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Show Status</DialogTitle>
            <DialogDescription>
              {statusOption?.label} for {selectedShows.length} selected show
              {selectedShows.length !== 1 ? 's' : ''}?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="max-h-40 overflow-y-auto space-y-1">
              {selectedShows.map(show => (
                <div key={show.id} className="text-sm p-2 bg-muted rounded">
                  {show.name} — currently <span className="font-medium">{show.status}</span>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleBulkStatusChange} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : (statusOption?.label ?? 'Apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={currentDialog === 'export'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Shows</DialogTitle>
            <DialogDescription>
              Export {selectedShows.length} selected show
              {selectedShows.length !== 1 ? 's' : ''} as CSV.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <p className="text-sm text-muted-foreground">
              The export will include name, organization, dates, location, and status for each
              selected show.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleBulkExport} disabled={isProcessing}>
              <Download className="h-4 w-4 mr-2" />
              {isProcessing ? 'Exporting...' : 'Download CSV'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={currentDialog === 'delete'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Shows</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedShows.length} selected show
              {selectedShows.length !== 1 ? 's' : ''}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This will permanently delete all show data including entries, results, and
                configuration.
              </AlertDescription>
            </Alert>

            <div className="max-h-40 overflow-y-auto space-y-1">
              {selectedShows.map(show => (
                <div key={show.id} className="text-sm p-2 bg-muted rounded">
                  {show.name}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isProcessing}>
              <Trash2 className="h-4 w-4 mr-2" />
              {isProcessing ? 'Deleting...' : 'Delete Shows'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
