/**
 * ShowBulkActionsBar — toolbar displayed when one or more shows are selected.
 *
 * Actions: status change, export, delete (with confirmation dialog).
 * Follows the same pattern as admin/users/BulkActionsBar.
 */

import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import {
  Trash2,
  AlertCircle,
  X,
  ChevronDown,
  Download,
  Archive,
  CheckCircle2,
  XCircle,
  CalendarCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

type ShowStatus = 'active' | 'completed' | 'cancelled' | 'archived';
type DialogType = 'status' | 'export' | 'delete' | null;

interface ShowBulkActionsBarProps {
  selectedShows: EnhancedShow[];
  onClearSelection: () => void;
  onBulkComplete: () => void;
}

const STATUS_OPTIONS: { value: ShowStatus; label: string; icon: React.ElementType }[] = [
  { value: 'active', label: 'Mark Active', icon: CheckCircle2 },
  { value: 'completed', label: 'Mark Completed', icon: CalendarCheck },
  { value: 'cancelled', label: 'Mark Cancelled', icon: XCircle },
  { value: 'archived', label: 'Archive', icon: Archive },
];

export const ShowBulkActionsBar: React.FC<ShowBulkActionsBarProps> = ({
  selectedShows,
  onClearSelection,
  onBulkComplete,
}) => {
  const [currentDialog, setCurrentDialog] = useState<DialogType>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ShowStatus>('active');

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

      // TODO: Replace with actual API call when backend supports bulk status update
      await new Promise(resolve => setTimeout(resolve, 800));

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

      // TODO: Replace with actual API call when backend supports bulk delete
      await new Promise(resolve => setTimeout(resolve, 800));

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
      {/* Bulk Actions Bar */}
      <Card
        className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 backdrop-blur-xl
                   rounded-2xl shadow-sm"
      >
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Badge
                variant="default"
                className="gap-2 px-4 py-2 rounded-full bg-primary/20 text-primary
                           border-0 font-semibold text-sm"
              >
                {selectedShows.length} selected
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-8 w-8 p-0 rounded-xl hover:bg-primary/20 transition-colors duration-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Status Change */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-4 rounded-xl border-border/50 bg-background/50 font-semibold
                               hover:bg-muted/50 transition-all duration-300"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Status
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="rounded-xl border-border/30 bg-card/95 backdrop-blur-xl shadow-xl">
                  {STATUS_OPTIONS.map(option => {
                    const Icon = option.icon;
                    return (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => {
                          setPendingStatus(option.value);
                          setCurrentDialog('status');
                        }}
                        className="rounded-lg font-medium text-sm py-3 focus:bg-primary/10 focus:text-primary"
                      >
                        <Icon className="h-4 w-4 mr-3" />
                        {option.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Export */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDialog('export')}
                className="h-10 px-4 rounded-xl border-border/50 bg-background/50 font-semibold
                           hover:bg-muted/50 transition-all duration-300"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>

              {/* Delete */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDialog('delete')}
                className="h-10 px-4 rounded-xl border-red-200/50 bg-red-50/50 text-red-600 font-semibold
                           hover:bg-red-100/50 hover:text-red-700 transition-all duration-300
                           dark:border-red-900/50 dark:bg-red-950/20 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
