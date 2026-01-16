/**
 * Scratch Management Tab
 *
 * Displays and manages scratch requests from exhibitors.
 * Allows secretary to approve, deny, and process refunds.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  CreditCard,
} from 'lucide-react';
import {
  getPendingScratchRequests,
  getScratchedEntries,
  approveScratchRequest,
  denyScratchRequest,
  updateRefundStatus,
  ScratchRequest,
} from '@/services/database/queries/dayOfOperationsQueries';

interface ScratchManagementTabProps {
  showId: string;
  onRefresh?: () => void;
}

export const ScratchManagementTab: React.FC<ScratchManagementTabProps> = ({
  showId,
  onRefresh,
}) => {
  const [pendingRequests, setPendingRequests] = useState<ScratchRequest[]>([]);
  const [processedScratches, setProcessedScratches] = useState<ScratchRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  // Dialog state
  const [selectedRequest, setSelectedRequest] = useState<ScratchRequest | null>(null);
  const [dialogAction, setDialogAction] = useState<'approve' | 'deny' | 'refund' | null>(null);
  const [processRefund, setProcessRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [denyReason, setDenyReason] = useState('');

  // Load data
  useEffect(() => {
    if (showId) {
      loadData();
    }
  }, [showId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [pendingResult, processedResult] = await Promise.all([
        getPendingScratchRequests(showId),
        getScratchedEntries(showId),
      ]);

      if (pendingResult.error) {
        setError('Failed to load scratch requests');
      } else {
        setPendingRequests(pendingResult.data as ScratchRequest[]);
      }

      if (!processedResult.error) {
        setProcessedScratches(processedResult.data as ScratchRequest[]);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setIsProcessing(true);

    try {
      const { error } = await approveScratchRequest(
        selectedRequest.id,
        processRefund,
        processRefund ? refundAmount : undefined
      );

      if (error) {
        toast.error('Failed to approve scratch request');
      } else {
        toast.success(
          processRefund
            ? 'Scratch approved with refund'
            : 'Scratch approved'
        );
        await loadData();
        onRefresh?.();
      }
    } catch (err) {
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
      const { error } = await denyScratchRequest(selectedRequest.id, denyReason);

      if (error) {
        toast.error('Failed to deny scratch request');
      } else {
        toast.success('Scratch request denied');
        await loadData();
        onRefresh?.();
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsProcessing(false);
      closeDialog();
    }
  };

  const handleProcessRefund = async () => {
    if (!selectedRequest) return;

    setIsProcessing(true);

    try {
      // In production, this would call a Stripe refund Edge Function
      // For now, just update the status
      const { error } = await updateRefundStatus(
        selectedRequest.id,
        'processed',
        refundAmount
      );

      if (error) {
        toast.error('Failed to process refund');
      } else {
        toast.success('Refund processed successfully');
        await loadData();
        onRefresh?.();
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsProcessing(false);
      closeDialog();
    }
  };

  const openApproveDialog = (request: ScratchRequest) => {
    setSelectedRequest(request);
    setDialogAction('approve');
    setProcessRefund(false);
    setRefundAmount(request.entry_fee || 0);
  };

  const openDenyDialog = (request: ScratchRequest) => {
    setSelectedRequest(request);
    setDialogAction('deny');
    setDenyReason('');
  };

  const openRefundDialog = (request: ScratchRequest) => {
    setSelectedRequest(request);
    setDialogAction('refund');
    setRefundAmount(request.entry_fee || 0);
  };

  const closeDialog = () => {
    setSelectedRequest(null);
    setDialogAction(null);
    setProcessRefund(false);
    setRefundAmount(0);
    setDenyReason('');
  };

  // Filter requests by search term
  const filterRequests = (requests: ScratchRequest[]) => {
    if (!searchTerm) return requests;
    const search = searchTerm.toLowerCase();
    return requests.filter(
      (request) =>
        request.entry?.dog?.name?.toLowerCase().includes(search) ||
        request.entry?.dog?.call_name?.toLowerCase().includes(search) ||
        request.entry?.handler?.toLowerCase().includes(search) ||
        request.class?.name?.toLowerCase().includes(search)
    );
  };

  const filteredPending = filterRequests(pendingRequests);
  const filteredProcessed = filterRequests(processedScratches);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getRefundStatusBadge = (status: string | null) => {
    switch (status) {
      case 'eligible':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700">Refund Eligible</Badge>;
      case 'processed':
        return <Badge variant="outline" className="bg-green-50 text-green-700">Refunded</Badge>;
      case 'denied':
        return <Badge variant="outline" className="bg-red-50 text-red-700">No Refund</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700">Pending</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-50 text-gray-500">N/A</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            Scratch Management
          </h3>
          <p className="text-sm text-muted-foreground">
            Review scratch requests and process refunds
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
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({filteredPending.length})
          </TabsTrigger>
          <TabsTrigger value="processed">
            Processed ({filteredProcessed.length})
          </TabsTrigger>
        </TabsList>

        {/* Pending Requests */}
        <TabsContent value="pending" className="mt-4">
          {filteredPending.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium">No Pending Scratch Requests</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm
                    ? 'No requests match your search'
                    : 'There are no pending scratch requests'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredPending.map((request) => (
                <Card key={request.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                          <Dog className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {request.entry?.dog?.name || 'Unknown Dog'}
                            </span>
                            {request.entry?.dog?.call_name && (
                              <span className="text-muted-foreground">
                                ({request.entry.dog.call_name})
                              </span>
                            )}
                            {request.entry?.armband_number && (
                              <Badge variant="outline">#{request.entry.armband_number}</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Handler: {request.entry?.handler || 'Not specified'}
                          </div>
                          {request.scratch_reason && (
                            <div className="text-sm text-muted-foreground italic">
                              Reason: {request.scratch_reason}
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
                          {formatDate(request.created_at)}
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

        {/* Processed Scratches */}
        <TabsContent value="processed" className="mt-4">
          {filteredProcessed.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium">No Processed Scratches</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm
                    ? 'No scratches match your search'
                    : 'There are no processed scratches for this show'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredProcessed.map((scratch) => (
                <Card key={scratch.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100">
                          <XCircle className="h-5 w-5 text-gray-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {scratch.entry?.dog?.name || 'Unknown Dog'}
                            </span>
                            {scratch.entry?.armband_number && (
                              <Badge variant="outline">#{scratch.entry.armband_number}</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {scratch.class?.class_number && `#${scratch.class.class_number} - `}
                            {scratch.class?.name}
                          </div>
                          {scratch.scratch_reason && (
                            <div className="text-xs text-muted-foreground italic">
                              {scratch.scratch_reason}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          {getRefundStatusBadge(scratch.refund_status)}
                          {scratch.refund_amount && scratch.refund_status === 'processed' && (
                            <div className="text-sm text-green-600 mt-1">
                              {formatCurrency(scratch.refund_amount)}
                            </div>
                          )}
                        </div>

                        <div className="text-sm text-muted-foreground">
                          Scratched: {formatDate(scratch.scratched_at)}
                        </div>

                        {scratch.refund_status === 'eligible' && scratch.entry?.stripe_payment_intent_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openRefundDialog(scratch)}
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            Process Refund
                          </Button>
                        )}
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
      <Dialog open={dialogAction === 'approve'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Scratch Request</DialogTitle>
            <DialogDescription>
              Approve the scratch request for {selectedRequest?.entry?.dog?.name} in{' '}
              {selectedRequest?.class?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="processRefund"
                checked={processRefund}
                onCheckedChange={(checked) => setProcessRefund(checked as boolean)}
              />
              <Label htmlFor="processRefund" className="cursor-pointer">
                Process refund for this entry
              </Label>
            </div>

            {processRefund && (
              <div className="space-y-2 pl-6">
                <Label htmlFor="refundAmount">Refund Amount (cents)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    id="refundAmount"
                    type="number"
                    value={(refundAmount / 100).toFixed(2)}
                    onChange={(e) => setRefundAmount(Math.round(parseFloat(e.target.value) * 100))}
                    className="max-w-[150px]"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Original entry fee: {formatCurrency(selectedRequest?.entry_fee || 0)}
                </p>
              </div>
            )}
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
                  Approve Scratch
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deny Dialog */}
      <Dialog open={dialogAction === 'deny'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Scratch Request</DialogTitle>
            <DialogDescription>
              Deny the scratch request for {selectedRequest?.entry?.dog?.name}.
              The exhibitor will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="denyReason">Reason (optional)</Label>
              <Textarea
                id="denyReason"
                placeholder="Enter a reason for denying this request..."
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
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

      {/* Process Refund Dialog */}
      <Dialog open={dialogAction === 'refund'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Process a refund for the scratched entry. This will initiate a refund via Stripe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertDescription>
                <strong>{selectedRequest?.entry?.dog?.name}</strong> - {selectedRequest?.class?.name}
                <br />
                Original payment: {formatCurrency(selectedRequest?.entry_fee || 0)}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="refundAmountProcess">Refund Amount</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="refundAmountProcess"
                  type="number"
                  value={(refundAmount / 100).toFixed(2)}
                  onChange={(e) => setRefundAmount(Math.round(parseFloat(e.target.value) * 100))}
                  className="max-w-[150px]"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleProcessRefund} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Process Refund
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScratchManagementTab;
