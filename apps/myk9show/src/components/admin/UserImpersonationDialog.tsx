import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useImpersonationContext } from '@/services/ImpersonationService';
import { auditService } from '@/services/AuditService';
import { UserRole } from '@/types/auth-types';
import { AuditAction } from '@/types/audit-types';
import { logger } from '@/services/LoggingService';
import {
  User, 
  Shield, 
  Clock, 
  AlertTriangle, 
  CheckCircle2,
  // XCircle,
  Eye,
  EyeOff,
  Timer,
  Key
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  lastActive?: Date;
  status: 'active' | 'suspended' | 'locked';
}

interface UserImpersonationDialogProps {
  triggerButton?: React.ReactNode;
  selectedUserId?: string;
  onImpersonationStart?: (context: unknown) => void;
  onImpersonationEnd?: () => void;
}

export const UserImpersonationDialog: React.FC<UserImpersonationDialogProps> = ({
  triggerButton,
  selectedUserId,
  onImpersonationStart,
  onImpersonationEnd
}) => {
  const { user: currentUser, hasRole } = useAuthContext();
  const { context: impersonationContext, isImpersonating, startImpersonation, endImpersonation } = useImpersonationContext();
  
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>(selectedUserId || '');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('30');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Verify admin role access
  const canImpersonate = hasRole(UserRole.SITE_ADMIN) || hasRole(UserRole.CLUB_ADMIN);

  useEffect(() => {
    if (open) {
      loadUsers();
    }
  }, [open]);

  useEffect(() => {
    if (selectedUserId) {
      setSelectedUser(selectedUserId);
    }
  }, [selectedUserId]);

  // Update time remaining for active impersonation
  useEffect(() => {
    if (impersonationContext?.isActive && impersonationContext.expiresAt) {
      const interval = setInterval(() => {
        const now = new Date();
        const remaining = impersonationContext.expiresAt.getTime() - now.getTime();
        setTimeRemaining(remaining > 0 ? remaining : 0);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setTimeRemaining(null);
    }
  }, [impersonationContext]);

  const loadUsers = async () => {
    try {
      // Mock data - in real implementation, this would fetch from API
      const mockUsers: User[] = [
        {
          id: 'exhibitor-user',
          email: 'exhibitor@example.com',
          name: 'Sarah Johnson',
          role: UserRole.EXHIBITOR,
          lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000),
          status: 'active'
        },
        {
          id: 'secretary-user',
          email: 'secretary@example.com',
          name: 'Mike Wilson',
          role: UserRole.SECRETARY,
          lastActive: new Date(Date.now() - 30 * 60 * 1000),
          status: 'active'
        },
        {
          id: 'judge-user',
          email: 'judge@example.com',
          name: 'Emma Davis',
          role: UserRole.JUDGE,
          lastActive: new Date(Date.now() - 5 * 60 * 1000),
          status: 'active'
        },
        {
          id: 'club-admin-user',
          email: 'clubadmin@example.com',
          name: 'Tom Brown',
          role: UserRole.CLUB_ADMIN,
          lastActive: new Date(Date.now() - 1 * 60 * 60 * 1000),
          status: 'active'
        }
      ];

      setUsers(mockUsers);
    } catch (error) {
      logger.error('Failed to load users:', 'admin', {}, error as Error);
      setError('Failed to load users');
    }
  };

  const handleStartImpersonation = async () => {
    if (!selectedUser || !reason.trim()) {
      setError('Please select a user and provide a reason');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Show 2FA dialog
      setShowTwoFactor(true);
      
      if (!twoFactorCode) {
        setIsLoading(false);
        return;
      }

      const context = await startImpersonation({
        targetUserId: selectedUser,
        reason: reason.trim(),
        duration: parseInt(duration) * 60 * 1000, // Convert minutes to milliseconds
        twoFactorCode: twoFactorCode
      });

      // Audit log
      await auditService.log({
        action: AuditAction.IMPERSONATE_START,
        entityType: 'user_impersonation',
        entityId: context.id,
        metadata: {
          targetUserId: selectedUser,
          reason: reason.trim(),
          duration: parseInt(duration),
          adminUserId: currentUser?.id
        }
      });

      onImpersonationStart?.(context);
      setOpen(false);
      resetForm();

    } catch (error) {
      logger.error('Failed to start impersonation:', 'admin', {}, error as Error);
      setError(error instanceof Error ? error.message : 'Failed to start impersonation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndImpersonation = async () => {
    if (!impersonationContext) return;

    setIsLoading(true);
    try {
      await endImpersonation();
      
      // Audit log
      await auditService.log({
        action: AuditAction.IMPERSONATE_END,
        entityType: 'user_impersonation',
        entityId: impersonationContext.id,
        metadata: {
          targetUserId: impersonationContext.targetUserId,
          duration: Date.now() - impersonationContext.startedAt.getTime(),
          adminUserId: currentUser?.id
        }
      });

      onImpersonationEnd?.();
    } catch (error) {
      logger.error('Failed to end impersonation:', 'admin', {}, error as Error);
      setError(error instanceof Error ? error.message : 'Failed to end impersonation');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedUser(selectedUserId || '');
    setReason('');
    setDuration('30');
    setTwoFactorCode('');
    setShowTwoFactor(false);
    setError('');
  };

  const formatTimeRemaining = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getSelectedUserInfo = () => {
    return users.find(u => u.id === selectedUser);
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case UserRole.SITE_ADMIN:
        return 'bg-red-100 text-red-800';
      case UserRole.CLUB_ADMIN:
        return 'bg-orange-100 text-orange-800';
      case UserRole.SECRETARY:
        return 'bg-blue-100 text-blue-800';
      case UserRole.JUDGE:
        return 'bg-purple-100 text-purple-800';
      case UserRole.EXHIBITOR:
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!canImpersonate) {
    return null;
  }

  // Show active impersonation status
  if (isImpersonating && impersonationContext) {
    const targetUser = users.find(u => u.id === impersonationContext.targetUserId);
    
    return (
      <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-yellow-600" />
          <span className="text-sm font-medium">
            Impersonating: {targetUser?.name || impersonationContext.targetUserId}
          </span>
        </div>
        
        {timeRemaining !== null && (
          <div className="flex items-center gap-1 text-sm text-yellow-600">
            <Timer className="h-3 w-3" />
            {formatTimeRemaining(timeRemaining)}
          </div>
        )}
        
        <Button
          size="sm"
          variant="outline"
          onClick={handleEndImpersonation}
          disabled={isLoading}
          className="ml-auto"
        >
          <EyeOff className="h-3 w-3 mr-1" />
          End Session
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        resetForm();
      }
    }}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="outline" className="text-yellow-600 border-yellow-600 hover:bg-yellow-50">
            <User className="h-4 w-4 mr-2" />
            Impersonate User
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            User Impersonation
          </DialogTitle>
          <DialogDescription>
            Securely impersonate a user for troubleshooting purposes. All actions will be audited.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!showTwoFactor ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-select">Select User</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user to impersonate" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <span>{user.name}</span>
                          <span className="text-muted-foreground">({user.email})</span>
                        </div>
                        <Badge className={getRoleBadgeColor(user.role)}>
                          {user.role.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedUser && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{getSelectedUserInfo()?.name}</p>
                    <p className="text-sm text-muted-foreground">{getSelectedUserInfo()?.email}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={getRoleBadgeColor(getSelectedUserInfo()?.role || UserRole.EXHIBITOR)}>
                      {getSelectedUserInfo()?.role.replace('_', ' ').toUpperCase()}
                    </Badge>
                    {getSelectedUserInfo()?.lastActive && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last active: {getSelectedUserInfo()?.lastActive?.toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Impersonation</Label>
              <Textarea
                id="reason"
                placeholder="Describe why you need to impersonate this user (required for audit trail)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Session Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes (recommended)</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours (max)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This action will be logged and monitored. Use impersonation only for legitimate troubleshooting purposes.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <Key className="h-12 w-12 text-blue-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold">Two-Factor Authentication Required</h3>
              <p className="text-muted-foreground">
                Enter your 6-digit authentication code to proceed with impersonation
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="2fa-code">Authentication Code</Label>
              <Input
                id="2fa-code"
                type="text"
                placeholder="123456"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-lg tracking-wider"
                maxLength={6}
              />
            </div>

            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <strong>Target:</strong> {getSelectedUserInfo()?.name} ({getSelectedUserInfo()?.email})<br />
                <strong>Duration:</strong> {duration} minutes<br />
                <strong>Reason:</strong> {reason}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {!showTwoFactor ? (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleStartImpersonation}
                disabled={!selectedUser || !reason.trim() || isLoading}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                {isLoading ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Require 2FA
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowTwoFactor(false)}>
                Back
              </Button>
              <Button
                onClick={handleStartImpersonation}
                disabled={twoFactorCode.length !== 6 || isLoading}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                {isLoading ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Starting Session...
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Start Impersonation
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};