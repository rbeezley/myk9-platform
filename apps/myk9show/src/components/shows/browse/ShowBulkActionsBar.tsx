/**
 * ShowBulkActionsBar — the Managing tab's floating bulk-action bar
 * (list-toolkit rollout, MYK9-798): Mark cancelled, Export, Delete. There is no
 * "Mark completed": the show's Close step is the only door to completed (MYK9-1945). Composes the shared `FloatingBulkBar`/`BulkBarButton` for the
 * floating shell. Delete goes through the shared `DeleteObjectDialog`, the
 * one delete path for every core object (CRUD standard Phase 2).
 */

import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { exportRowsCsv } from '@/utils/downloadCsv';
import { updateShow } from '@/services/database/shows';
import { DeleteObjectDialog, showDeleteDetail } from '@/features/delete';
import { Trash2, AlertCircle, Download, XCircle } from 'lucide-react';
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
import { SHOW_STATUS_VALUES, getStatusDescriptor } from '@/components/status';
import { SHOW_ADMIN_COPY, bulkStatusPartialFailed } from '@/components/shows/showAdminErrorCopy';

// Must stay in sync with the shows_status_check CHECK constraint
// (migration 072): draft | published | upcoming | in_progress | completed | cancelled.
// 'completed' is deliberately absent: only the Close step on the Results tab sets it, because it
// also completes the trials and classes and reads what is left (MYK9-1945).
// 'published' is deliberately absent: publishing opens online entries and must
// go through the Stripe-payouts gate (onlineEntryGate), which is per-club —
// a bulk write can't evaluate it. Publish from the show's own status pill.
type ShowStatus = 'cancelled';
type DialogType = 'status' | 'delete' | null;

interface ShowBulkActionsBarProps {
  selectedShows: EnhancedShow[];
  onClearSelection: () => void;
  onBulkComplete: () => void;
}

/** The show's status as the status pill and the shows table word it. */
function showStatusLabel(status: string): string {
  return (SHOW_STATUS_VALUES as readonly string[]).includes(status)
    ? getStatusDescriptor('show', status).label
    : status;
}

const STATUS_OPTIONS: { value: ShowStatus; label: string; icon: React.ElementType }[] = [
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
  const [pendingStatus, setPendingStatus] = useState<ShowStatus>('cancelled');

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
        setError(SHOW_ADMIN_COPY.bulkStatusAllFailed);
        return;
      }
      if (failedCount > 0) {
        // Partial failure: refresh + clear selection so the succeeded subset
        // reflects immediately and a retry can't re-hit already-updated shows.
        notifications.error(bulkStatusPartialFailed(failedCount, selectedShows.length), {
          description:
            'The other shows were updated. Select the ones that did not change and try again.',
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
      setError(SHOW_ADMIN_COPY.bulkStatusUnfinished);
    } finally {
      setIsProcessing(false);
    }
  };

  // A download changes nothing, so it runs on the press with no confirm step (MYK9-1793).
  const handleBulkExport = () => {
    try {
      logger.debug('Bulk show export', 'shows', {
        showIds: selectedShows.map(s => s.id),
      });

      exportRowsCsv(
        'shows',
        ['Name', 'Organization', 'Start Date', 'End Date', 'Location', 'Status'],
        selectedShows.map(show => [
          show.name,
          show.organization,
          show.startDate,
          show.endDate,
          show.location,
          show.status,
        ])
      );

      logger.info('Bulk export complete', 'shows', { count: selectedShows.length });

      onBulkComplete();
    } catch {
      notifications.error(SHOW_ADMIN_COPY.exportFailed);
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
            setPendingStatus('cancelled');
            setCurrentDialog('status');
          }}
          icon={<XCircle className="h-4 w-4" aria-hidden="true" />}
        >
          Mark cancelled
        </BulkBarButton>
        <BulkBarButton
          onClick={handleBulkExport}
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
                  {show.name}, currently{' '}
                  <span className="font-medium">{showStatusLabel(show.status)}</span>
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

      {/* Delete: the shared dialog (counts, blockers, Undo). */}
      {currentDialog === 'delete' && (
        <DeleteObjectDialog
          open
          onOpenChange={open => {
            if (!open) closeDialog();
          }}
          kind="show"
          targets={selectedShows.map(show => ({
            id: show.id,
            name: show.name,
            detail: showDeleteDetail(show),
            context: { showId: show.id, showStatus: show.status },
          }))}
          onDeleted={() => onBulkComplete()}
        />
      )}
    </>
  );
};
