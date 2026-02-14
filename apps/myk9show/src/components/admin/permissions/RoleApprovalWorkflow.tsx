/**
 * Role Approval Workflow Component
 * Phase 4.8: Role approval workflow system
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { logger } from '@/services/LoggingService';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  GitBranch, 
  Clock, 
  XCircle,
  AlertTriangle,
  User,
  Calendar,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Forward
} from 'lucide-react';
import { format } from 'date-fns';
// import { rbacService } from '@/services/rbac/RBACService'; // Not used in current implementation

interface ApprovalRequest {
  id: string;
  type: 'role_assignment' | 'role_creation' | 'permission_change' | 'bulk_operation';
  title: string;
  description: string;
  requestedBy: {
    id: string;
    email: string;
    name?: string;
  };
  requestedFor?: {
    id: string;
    email: string;
    name?: string;
  };
  status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'expired';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  expiresAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  comments: ApprovalComment[];
  metadata: {
    roleId?: string;
    roleName?: string;
    permissions?: string[];
    affectedUsers?: number;
    justification?: string;
  };
}

interface ApprovalComment {
  id: string;
  userId: string;
  userEmail: string;
  comment: string;
  createdAt: string;
  type: 'comment' | 'approval' | 'rejection' | 'escalation';
}

interface RoleApprovalWorkflowProps {
  onRequestUpdate?: (request: ApprovalRequest) => void;
}

export const RoleApprovalWorkflow: React.FC<RoleApprovalWorkflowProps> = ({
  onRequestUpdate
}) => {
  const { user } = useAuthContext();
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApprovalData();
  }, []);

  const loadApprovalData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Mock data - in real implementation, this would come from the database
      const mockRequests: ApprovalRequest[] = [
        {
          id: 'req-1',
          type: 'role_assignment',
          title: 'Assign Show Manager Role',
          description: 'Request to assign Show Manager role to John Smith for upcoming regional show',
          requestedBy: {
            id: 'user-1',
            email: 'secretary@tulsa-dogs.org',
            name: 'Jane Secretary'
          },
          requestedFor: {
            id: 'user-2',
            email: 'john.smith@email.com',
            name: 'John Smith'
          },
          status: 'pending',
          priority: 'high',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
          comments: [
            {
              id: 'comment-1',
              userId: 'user-1',
              userEmail: 'secretary@tulsa-dogs.org',
              comment: 'John has extensive experience managing shows and is needed for the upcoming regional event.',
              createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              type: 'comment'
            }
          ],
          metadata: {
            roleId: 'show-manager-role',
            roleName: 'Show Manager',
            justification: 'Temporary assignment for regional show management'
          }
        },
        {
          id: 'req-2',
          type: 'permission_change',
          title: 'Modify Secretary Permissions',
          description: 'Request to add judge assignment permissions to Secretary role',
          requestedBy: {
            id: 'user-3',
            email: 'admin@club.org',
            name: 'Club Admin'
          },
          status: 'approved',
          priority: 'medium',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          approvedBy: 'site-admin',
          approvedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          comments: [
            {
              id: 'comment-2',
              userId: 'site-admin',
              userEmail: 'admin@system.com',
              comment: 'Approved - this aligns with standard secretary responsibilities.',
              createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              type: 'approval'
            }
          ],
          metadata: {
            roleId: 'secretary-role',
            roleName: 'Secretary',
            permissions: ['judge:assign', 'judge:view'],
            justification: 'Secretaries need to assign judges to classes'
          }
        },
        {
          id: 'req-3',
          type: 'bulk_operation',
          title: 'Bulk Role Assignment',
          description: 'Request to assign Exhibitor role to 25 new club members',
          requestedBy: {
            id: 'user-4',
            email: 'membership@club.org',
            name: 'Membership Chair'
          },
          status: 'escalated',
          priority: 'low',
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          comments: [],
          metadata: {
            roleId: 'exhibitor-role',
            roleName: 'Exhibitor',
            affectedUsers: 25,
            justification: 'New member batch from recent registration drive'
          }
        }
      ];

      setApprovalRequests(mockRequests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approval data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproval = async (requestId: string, approved: boolean) => {
    if (!actionComment.trim() && !approved) {
      setError('Please provide a comment when rejecting a request');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // In real implementation, this would call the API
      logger.debug('Processing approval:', 'admin', { data: { requestId, approved, comment: actionComment } });

      // Update local state
      setApprovalRequests(prev => prev.map(req => 
        req.id === requestId 
          ? {
              ...req,
              status: approved ? 'approved' : 'rejected',
              [approved ? 'approvedBy' : 'rejectedBy']: user?.id || 'unknown',
              [approved ? 'approvedAt' : 'rejectedAt']: new Date().toISOString(),
              comments: [
                ...req.comments,
                {
                  id: `comment-${Date.now()}`,
                  userId: user?.id || 'unknown',
                  userEmail: user?.email || 'unknown',
                  comment: actionComment || (approved ? 'Approved' : 'Rejected'),
                  createdAt: new Date().toISOString(),
                  type: approved ? 'approval' : 'rejection'
                }
              ]
            }
          : req
      ));

      setActionComment('');
      setSelectedRequest(null);

      if (onRequestUpdate) {
        const updatedRequest = approvalRequests.find(req => req.id === requestId);
        if (updatedRequest) {
          onRequestUpdate(updatedRequest);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process approval');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEscalation = async (requestId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // In real implementation, this would call the API
      logger.debug('Escalating request:', 'admin', { data: requestId });

      setApprovalRequests(prev => prev.map(req => 
        req.id === requestId 
          ? {
              ...req,
              status: 'escalated',
              comments: [
                ...req.comments,
                {
                  id: `comment-${Date.now()}`,
                  userId: user?.id || 'unknown',
                  userEmail: user?.email || 'unknown',
                  comment: actionComment || 'Request escalated for additional review',
                  createdAt: new Date().toISOString(),
                  type: 'escalation'
                }
              ]
            }
          : req
      ));

      setActionComment('');
      setSelectedRequest(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to escalate request');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Pending</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-100 text-green-700">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'escalated':
        return <Badge variant="secondary" className="bg-purple-100 text-purple-700">Escalated</Badge>;
      case 'expired':
        return <Badge variant="outline" className="border-gray-500 text-gray-700">Expired</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge variant="default" className="bg-red-100 text-red-700">High</Badge>;
      case 'medium':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">Normal</Badge>;
    }
  };

  const pendingRequests = approvalRequests.filter(req => req.status === 'pending');
  const recentRequests = approvalRequests.filter(req => req.status !== 'pending').slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Role Approval Workflow
          </CardTitle>
          <CardDescription>
            Manage approval requests for role assignments and permission changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-3 border rounded">
              <div className="text-2xl font-bold text-yellow-600">
                {pendingRequests.length}
              </div>
              <div className="text-sm text-muted-foreground">Pending Approval</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="text-2xl font-bold text-green-600">
                {approvalRequests.filter(req => req.status === 'approved').length}
              </div>
              <div className="text-sm text-muted-foreground">Approved Today</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="text-2xl font-bold text-red-600">
                {approvalRequests.filter(req => req.status === 'rejected').length}
              </div>
              <div className="text-sm text-muted-foreground">Rejected</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="text-2xl font-bold text-purple-600">
                {approvalRequests.filter(req => req.status === 'escalated').length}
              </div>
              <div className="text-sm text-muted-foreground">Escalated</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Approval Requests
            </CardTitle>
            <CardDescription>
              Requests awaiting your approval or action
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{request.title}</h4>
                        {getPriorityBadge(request.priority)}
                        {getStatusBadge(request.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {request.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {request.requestedBy.name || request.requestedBy.email}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(request.createdAt), 'PPp')}
                        </div>
                        {request.expiresAt && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Expires {format(new Date(request.expiresAt), 'PPp')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Request Details */}
                  <div className="bg-muted/30 p-3 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {request.metadata.roleName && (
                        <div>
                          <span className="font-medium">Role:</span> {request.metadata.roleName}
                        </div>
                      )}
                      {request.requestedFor && (
                        <div>
                          <span className="font-medium">For User:</span> {request.requestedFor.name || request.requestedFor.email}
                        </div>
                      )}
                      {request.metadata.affectedUsers && (
                        <div>
                          <span className="font-medium">Affected Users:</span> {request.metadata.affectedUsers}
                        </div>
                      )}
                      {request.metadata.justification && (
                        <div className="md:col-span-2">
                          <span className="font-medium">Justification:</span> {request.metadata.justification}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setSelectedRequest(request)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApproval(request.id, true)}
                      disabled={isLoading}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Quick Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEscalation(request.id)}
                      disabled={isLoading}
                    >
                      <Forward className="h-4 w-4 mr-2" />
                      Escalate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Requests */}
      {recentRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Recently processed approval requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium text-sm">{request.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {request.requestedBy.name || request.requestedBy.email} • {format(new Date(request.createdAt), 'PPp')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(request.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request Review Modal */}
      {selectedRequest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Review Request: {selectedRequest.title}
              <Button variant="outline" size="sm" onClick={() => setSelectedRequest(null)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Requested By</Label>
                <p className="text-sm">{selectedRequest.requestedBy.name || selectedRequest.requestedBy.email}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                <p className="text-sm">{format(new Date(selectedRequest.createdAt), 'PPpp')}</p>
              </div>
              {selectedRequest.requestedFor && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">For User</Label>
                  <p className="text-sm">{selectedRequest.requestedFor.name || selectedRequest.requestedFor.email}</p>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                <div className="mt-1">{getPriorityBadge(selectedRequest.priority)}</div>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Description</Label>
              <p className="text-sm mt-1">{selectedRequest.description}</p>
            </div>

            {selectedRequest.metadata.justification && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Justification</Label>
                <p className="text-sm mt-1">{selectedRequest.metadata.justification}</p>
              </div>
            )}

            {/* Comments */}
            {selectedRequest.comments.length > 0 && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Comments</Label>
                <div className="mt-2 space-y-2">
                  {selectedRequest.comments.map((comment) => (
                    <div key={comment.id} className="p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{comment.userEmail}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(comment.createdAt), 'PPp')}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {comment.type}
                        </Badge>
                      </div>
                      <p className="text-sm">{comment.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Comment */}
            <div>
              <Label htmlFor="action-comment">Add Comment</Label>
              <Textarea
                id="action-comment"
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                placeholder="Add a comment about your decision..."
                rows={3}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-4 border-t">
              <Button
                onClick={() => handleApproval(selectedRequest.id, true)}
                disabled={isLoading}
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => handleApproval(selectedRequest.id, false)}
                disabled={isLoading}
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                variant="outline"
                onClick={() => handleEscalation(selectedRequest.id)}
                disabled={isLoading}
              >
                <Forward className="h-4 w-4 mr-2" />
                Escalate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};