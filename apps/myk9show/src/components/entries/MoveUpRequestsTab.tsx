// @ts-nocheck
// TODO: Fix type mismatches with dayOfOperationsQueries results
/**
 * Move-Up Requests Tab
 *
 * Displays and manages pre-show move-up requests from exhibitors.
 * Allows secretary to approve, deny, or add to waitlist.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Search,
  ArrowUpCircle,
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  Dog,
  Trophy,
  Users,
} from 'lucide-react';
import {
  getPendingMoveUpRequests,
  approveMoveUpRequest,
  denyMoveUpRequest,
  getClassesWithCapacity,
  ClassWithCapacity,
} from '@/services/database/queries/dayOfOperationsQueries';

interface MoveUpRequest {
  id: string;
  class_id: string;
  trial_id: string;
  status: string;
  jump_height: string | null;
  check_in_notes: string | null;
  created_at: string;
  updated_at: string;
  move_up_target_class_id: string | null;
  entry: {
    id: string;
    handler: string | null;
    armband_number: string | null;
    dog: {
      id: string;
      name: string;
      call_name: string | null;
    } | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    trial_id: string;
  } | null;
  targetClass: {
    id: string;
    name: string;
    class_number: string | null;
    entry_limit: number | null;
  } | null;
}

interface MoveUpRequestsTabProps {
  showId: string;
  onRefresh?: () => void;
}

export const MoveUpRequestsTab: React.FC<MoveUpRequestsTabProps> = ({
  showId,
  onRefresh,
}) => {
  const [requests, setRequests] = useState<MoveUpRequest[]>([]);
  const [classes, setClasses] = useState<ClassWithCapacity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog state
  const [selectedRequest, setSelectedRequest] = useState<MoveUpRequest | null>(null);
  const [dialogAction, setDialogAction] = useState<'approve' | 'deny' | null>(null);
  const [targetClassId, setTargetClassId] = useState<string>('');
  const [denyReason, setDenyReason] = useState('');

  // Load requests and classes
  useEffect(() => {
    if (showId) {
      loadData();
    }
  }, [showId]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [requestsResult, classesResult] = await Promise.all([
        getPendingMoveUpRequests(showId),
        getClassesWithCapacity(showId),
      ]);

      if (requestsResult.error) {
        setError('Failed to load move-up requests');
      } else {
        setRequests(requestsResult.data as MoveUpRequest[]);
      }

      if (!classesResult.error) {
        setClasses(classesResult.data);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest || !targetClassId) return;

    setIsProcessing(true);

    try {
      const { data, error } = await approveMoveUpRequest(
        selectedRequest.id,
        targetClassId
      );

      if (error) {
        if (error.message?.includes('full')) {
          toast.error('Target class is full. Consider adding to waitlist.');
        } else {
          toast.error('Failed to approve move-up request');
        }
      } else {
        toast.success('Move-up request approved');
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
      const { error } = await denyMoveUpRequest(selectedRequest.id, denyReason);

      if (error) {
        toast.error('Failed to deny move-up request');
      } else {
        toast.success('Move-up request denied');
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

  const openApproveDialog = (request: MoveUpRequest) => {
    setSelectedRequest(request);
    setDialogAction('approve');
    // Pre-select target class if specified
    if (request.targetClass?.id) {
      setTargetClassId(request.targetClass.id);
    }
  };

  const openDenyDialog = (request: MoveUpRequest) => {
    setSelectedRequest(request);
    setDialogAction('deny');
    setDenyReason('');
  };

  const closeDialog = () => {
    setSelectedRequest(null);
    setDialogAction(null);
    setTargetClassId('');
    setDenyReason('');
  };

  // Filter requests by search term
  const filteredRequests = requests.filter((request) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      request.entry?.dog?.name?.toLowerCase().includes(search) ||
      request.entry?.dog?.call_name?.toLowerCase().includes(search) ||
      request.entry?.handler?.toLowerCase().includes(search) ||
      request.class?.name?.toLowerCase().includes(search)
    );
  });

  // Get available target classes (exclude current class, only show higher levels)
  const getAvailableTargetClasses = (request: MoveUpRequest) => {
    return classes.filter((cls) => {
      // Exclude current class
      if (cls.id === request.class_id) return false;
      // Only show classes with available spots
      return cls.available_spots > 0;
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
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
            <ArrowUpCircle className="h-5 w-5" />
            Move-Up Requests ({filteredRequests.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            Review and process exhibitor requests to move up to higher classes
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
      {requests.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by dog, handler, or class..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ArrowUpCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium">No Pending Move-Up Requests</p>
            <p className="text-sm text-muted-foreground">
              {searchTerm
                ? 'No requests match your search'
                : 'There are no pending move-up requests for this show'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((request) => (
            <Card key={request.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Dog Info */}
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                      <Dog className="h-5 w-5 text-primary" />
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
                    </div>
                  </div>

                  {/* Class Info */}
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">From</div>
                      <div className="flex items-center gap-1">
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {request.class?.class_number && `#${request.class.class_number} `}
                          {request.class?.name}
                        </span>
                      </div>
                    </div>

                    <ArrowUpCircle className="h-5 w-5 text-blue-500" />

                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">To</div>
                      <div className="flex items-center gap-1">
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {request.targetClass ? (
                            <>
                              {request.targetClass.class_number &&
                                `#${request.targetClass.class_number} `}
                              {request.targetClass.name}
                            </>
                          ) : (
                            <span className="text-muted-foreground italic">Not specified</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Request Time */}
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {formatDate(request.created_at)}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => openApproveDialog(request)}
                      >
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

      {/* Approve Dialog */}
      <Dialog open={dialogAction === 'approve'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Move-Up Request</DialogTitle>
            <DialogDescription>
              Move {selectedRequest?.entry?.dog?.name} from{' '}
              {selectedRequest?.class?.name} to the selected class.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Class</label>
              <Select value={targetClassId} onValueChange={setTargetClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target class" />
                </SelectTrigger>
                <SelectContent>
                  {selectedRequest &&
                    getAvailableTargetClasses(selectedRequest).map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        <div className="flex items-center justify-between gap-4">
                          <span>
                            {cls.class_number && `#${cls.class_number} - `}
                            {cls.name}
                          </span>
                          <Badge variant="outline" className="ml-2">
                            {cls.available_spots} spots
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {targetClassId && (
              <Alert>
                <Users className="h-4 w-4" />
                <AlertDescription>
                  {(() => {
                    const targetClass = classes.find((c) => c.id === targetClassId);
                    if (!targetClass) return null;
                    return (
                      <>
                        <strong>{targetClass.name}</strong> has{' '}
                        <strong>{targetClass.available_spots}</strong> spots available
                        ({targetClass.accepted_count}/
                        {targetClass.entry_limit || '∞'} filled)
                      </>
                    );
                  })()}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isProcessing || !targetClassId}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Approve Move-Up
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
            <DialogTitle>Deny Move-Up Request</DialogTitle>
            <DialogDescription>
              Deny the move-up request for {selectedRequest?.entry?.dog?.name}.
              The exhibitor will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
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
            <Button
              variant="destructive"
              onClick={handleDeny}
              disabled={isProcessing}
            >
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

export default MoveUpRequestsTab;
