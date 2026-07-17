/**
 * Pull Management Tab
 *
 * Displays and manages pull requests from exhibitors.
 * Secretary can approve or deny requests here.
 * Refund reconciliation lives in Entry Management (filter: Pulled).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { formatEntryDateTime } from '@/lib/format/dates';
import {
  Search,
  XCircle,
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  Dog,
  Trophy,
  DollarSign,
} from 'lucide-react';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import {
  getPendingPullRequests,
  getPulledEntries,
  type PullRecord,
} from '@/services/database/day-of-operations';
import {
  approvePullRequestReplicated,
  denyPullRequestReplicated,
} from '@/services/show-day/requestManagement';

interface PullManagementTabProps {
  showId: string;
  onRefresh?: () => void;
}

export const PullManagementTab: React.FC<PullManagementTabProps> = ({ showId, onRefresh }) => {
  const [pendingRequests, setPendingRequests] = useState<PullRecord[]>([]);
  const [processedPulls, setProcessedPulls] = useState<PullRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  const [selectedRequest, setSelectedRequest] = useState<PullRecord | null>(null);
  const [dialogAction, setDialogAction] = useState<'approve' | 'deny' | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [pendingResult, processedResult] = await Promise.all([
        getPendingPullRequests(showId),
        getPulledEntries(showId),
      ]);

      if (pendingResult.error) {
        setError('Failed to load pull requests');
      } else {
        setPendingRequests(pendingResult.data as PullRecord[]);
      }

      if (!processedResult.error) {
        setProcessedPulls(processedResult.data as PullRecord[]);
      }
    } catch (_err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [showId]);

  useEffect(() => {
    if (showId) {
      void loadData();
    }
  }, [showId, loadData]);

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setIsProcessing(true);

    try {
      const { error } = await approvePullRequestReplicated(selectedRequest.id);

      if (error) {
        toast.error('Failed to approve pull request');
      } else {
        toast.success('Pull approved');
        await loadData();
        onRefresh?.();
      }
    } catch (_err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsProcessing(false);
      closeDialog();
    }
  };

  const handleDeny = async () => {
    if (!selectedRequest) return;

    setIsProcessing(true);

    try {
      const { error } = await denyPullRequestReplicated(selectedRequest.id, denyReason);

      if (error) {
        toast.error('Failed to deny pull request');
      } else {
        toast.success('Pull request denied');
        await loadData();
        onRefresh?.();
      }
    } catch (_err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsProcessing(false);
      closeDialog();
    }
  };

  const openApproveDialog = (request: PullRecord) => {
    setSelectedRequest(request);
    setDialogAction('approve');
  };

  const openDenyDialog = (request: PullRecord) => {
    setSelectedRequest(request);
    setDialogAction('deny');
    setDenyReason('');
  };

  const closeDialog = () => {
    setSelectedRequest(null);
    setDialogAction(null);
    setDenyReason('');
  };

  const filterRequests = (items: PullRecord[]) => {
    if (!searchTerm) return items;
    const search = searchTerm.toLowerCase();
    return items.filter(
      request =>
        request.dog?.name?.toLowerCase().includes(search) ||
        request.dog?.call_name?.toLowerCase().includes(search) ||
        request.handler?.toLowerCase().includes(search) ||
        request.class?.name?.toLowerCase().includes(search)
    );
  };

  const filteredPending = filterRequests(pendingRequests);
  const filteredProcessed = filterRequests(processedPulls);

  const formatPullDateTime = (dateStr: string | null) => formatEntryDateTime(dateStr) || 'N/A';

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getPullTimingBadge = (timing: 'before_close' | 'after_close' | null) => {
    switch (timing) {
      case 'before_close':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700">
            Before close
          </Badge>
        );
      case 'after_close':
        return (
          <Badge variant="outline" className="bg-orange-50 text-orange-700">
            After close
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-500">
            Timing unknown
          </Badge>
        );
    }
  };

  if (isLoading) {
    // Section load = table skeleton (previews the pulled-entries table).
    // The inline "Processing…" button spinners below stay animate-spin.
    return (
      <div role="status" aria-label="Loading pulled entries" className="py-4">
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Pull Management
          </h3>
          <p className="text-sm text-muted-foreground">
            Review and approve pull requests. Refund decisions are made in Entry Management.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by dog, handler, or class..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({filteredPending.length})</TabsTrigger>
          <TabsTrigger value="processed">Pulled ({filteredProcessed.length})</TabsTrigger>
        </TabsList>

        {/* Pending Requests */}
        <TabsContent value="pending" className="mt-4">
          {filteredPending.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium">No Pending Pull Requests</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm
                    ? 'No requests match your search'
                    : 'There are no pending pull requests'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredPending.map(request => (
                <Card key={request.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
                          <Dog className="h-5 w-5 text-destructive" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {request.dog?.name || 'Unknown Dog'}
                            </span>
                            {request.dog?.call_name && (
                              <span className="text-muted-foreground">
                                ({request.dog.call_name})
                              </span>
                            )}
                            {request.armband && <Badge variant="outline">#{request.armband}</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Handler: {request.handler || 'Not specified'}
                          </div>
                          {request.pull_reason && (
                            <div className="text-sm text-muted-foreground italic">
                              Reason: {request.pull_reason}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className="flex items-center gap-1">
                            <Trophy className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {request.class?.class_number && `#${request.class.class_number} `}
                              {request.class?.name}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            Entry Fee: {formatCurrency(request.entry_fee || 0)}
                          </div>
                        </div>

                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatPullDateTime(request.created_at)}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => openApproveDialog(request)}>
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openDenyDialog(request)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Deny
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Pulled entries */}
        <TabsContent value="processed" className="mt-4">
          {filteredProcessed.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium">No Pulled Entries</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm
                    ? 'No pulls match your search'
                    : 'There are no pulled entries for this show'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredProcessed.map(pull => (
                <Card key={pull.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100">
                          <XCircle className="h-5 w-5 text-gray-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{pull.dog?.name || 'Unknown Dog'}</span>
                            {pull.armband && <Badge variant="outline">#{pull.armband}</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {pull.class?.class_number && `#${pull.class.class_number} - `}
                            {pull.class?.name}
                          </div>
                          {pull.pull_reason && (
                            <div className="text-xs text-muted-foreground italic">
                              {pull.pull_reason}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        {getPullTimingBadge(pull.pull_timing)}

                        <div className="text-sm text-muted-foreground">
                          Pulled: {formatPullDateTime(pull.pulled_at ?? pull.updated_at)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <Dialog open={dialogAction === 'approve'} onOpenChange={open => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Pull Request</DialogTitle>
            <DialogDescription>
              Approve the pull request for {selectedRequest?.dog?.name} in{' '}
              {selectedRequest?.class?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              The entry will be marked as pulled. To issue a refund, go to Entry Management and
              filter by Pulled.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Approve Pull
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deny Dialog */}
      <Dialog open={dialogAction === 'deny'} onOpenChange={open => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Pull Request</DialogTitle>
            <DialogDescription>
              Deny the pull request for {selectedRequest?.dog?.name}. The exhibitor will be
              notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="denyReason">Reason (optional)</Label>
              <Textarea
                id="denyReason"
                placeholder="Enter a reason for denying this request..."
                value={denyReason}
                onChange={e => setDenyReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeny} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Deny Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PullManagementTab;
