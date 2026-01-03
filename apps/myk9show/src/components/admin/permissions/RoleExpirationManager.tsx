/**
 * Role Expiration Manager Component
 * Phase 4.5: Role expiration and time-based permissions
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Input component not used in final implementation
import { Label } from '@/components/ui/label';
import { 
  Clock, 
  Calendar as CalendarIcon, 
  AlertTriangle,
  Info,
  Timer,
  Plus
} from 'lucide-react';
import { format, addDays, isBefore } from 'date-fns';
// import { rbacService } from '@/services/rbac/RBACService'; // Not used in current implementation
import { UserRole } from '@/types/rbac-types';

interface ExpirationRule {
  id: string;
  roleId: string;
  roleName: string;
  defaultDuration: number; // in days
  maxDuration: number; // in days
  autoRenew: boolean;
  renewalNotice: number; // days before expiration to notify
  requiresApproval: boolean;
}

interface RoleExpirationManagerProps {
  userRoles: UserRole[];
  onExpirationUpdate?: (userRoleId: string, expiresAt: string | null) => void;
  // onRulesUpdate?: (rules: ExpirationRule[]) => void; // Not used in current implementation
}

export const RoleExpirationManager: React.FC<RoleExpirationManagerProps> = ({
  userRoles,
  onExpirationUpdate
  // onRulesUpdate - commented out as not used
}) => {
  const [expirationRules, setExpirationRules] = useState<ExpirationRule[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  // const [selectedRole] = useState<string>(''); // Commented out as not used
  // const [customDuration, setCustomDuration] = useState<number>(30); // Commented out as not used
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadExpirationRules();
  }, []);

  const loadExpirationRules = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Mock data - in real implementation, this would come from the database
      const mockRules: ExpirationRule[] = [
        {
          id: 'rule-1',
          roleId: 'secretary-role',
          roleName: 'Secretary',
          defaultDuration: 365, // 1 year
          maxDuration: 730, // 2 years
          autoRenew: true,
          renewalNotice: 30,
          requiresApproval: false
        },
        {
          id: 'rule-2',
          roleId: 'show-manager-role',
          roleName: 'Show Manager',
          defaultDuration: 180, // 6 months
          maxDuration: 365, // 1 year
          autoRenew: false,
          renewalNotice: 14,
          requiresApproval: true
        },
        {
          id: 'rule-3',
          roleId: 'temp-volunteer-role',
          roleName: 'Temporary Volunteer',
          defaultDuration: 30, // 1 month
          maxDuration: 90, // 3 months
          autoRenew: false,
          renewalNotice: 7,
          requiresApproval: false
        }
      ];

      setExpirationRules(mockRules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expiration rules');
    } finally {
      setIsLoading(false);
    }
  };

  const getExpirationStatus = (userRole: UserRole): 'active' | 'expiring' | 'expired' | 'permanent' => {
    if (!userRole.expires_at) return 'permanent';

    const expirationDate = new Date(userRole.expires_at);
    const now = new Date();
    const thirtyDaysFromNow = addDays(now, 30);

    if (isBefore(expirationDate, now)) return 'expired';
    if (isBefore(expirationDate, thirtyDaysFromNow)) return 'expiring';
    return 'active';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'expiring':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Expiring Soon</Badge>;
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'permanent':
        return <Badge variant="secondary">Permanent</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getQuickExpirationDate = (days: number): Date => {
    return addDays(new Date(), days);
  };

  const handleSetExpiration = async (userRoleId: string, expiresAt: Date | null) => {
    try {
      setIsLoading(true);
      setError(null);

      // In real implementation, this would call the API
      console.log('Setting expiration:', { userRoleId, expiresAt });

      if (onExpirationUpdate) {
        onExpirationUpdate(userRoleId, expiresAt?.toISOString() || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set expiration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtendExpiration = async (userRoleId: string, additionalDays: number) => {
    const userRole = userRoles.find(ur => ur.id === userRoleId);
    if (!userRole) return;

    const currentExpiration = userRole.expires_at ? new Date(userRole.expires_at) : new Date();
    const newExpiration = addDays(currentExpiration, additionalDays);
    
    await handleSetExpiration(userRoleId, newExpiration);
  };

  const handleBulkExtension = async (days: number) => {
    const expiringRoles = userRoles.filter(ur => {
      const status = getExpirationStatus(ur);
      return status === 'expiring' || status === 'expired';
    });

    for (const userRole of expiringRoles) {
      await handleExtendExpiration(userRole.id, days);
    }
  };

  const groupedRoles = userRoles.reduce((acc, userRole) => {
    const status = getExpirationStatus(userRole);
    if (!acc[status]) acc[status] = [];
    acc[status].push(userRole);
    return acc;
  }, {} as Record<string, UserRole[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Role Expiration Management
          </CardTitle>
          <CardDescription>
            Manage time-based permissions and role expiration dates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Time-based permissions help maintain security by automatically revoking access after specified periods. 
              Roles can be set to expire automatically or require manual renewal.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {groupedRoles.expired?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Expired Roles</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {groupedRoles.expiring?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Expiring Soon</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {groupedRoles.active?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Active Roles</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {groupedRoles.permanent?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Permanent Roles</div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions */}
      {(groupedRoles.expired?.length > 0 || groupedRoles.expiring?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bulk Actions</CardTitle>
            <CardDescription>
              Quickly extend expiration dates for multiple roles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => handleBulkExtension(30)}
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Extend by 30 days
              </Button>
              <Button
                variant="outline"
                onClick={() => handleBulkExtension(90)}
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Extend by 90 days
              </Button>
              <Button
                variant="outline"
                onClick={() => handleBulkExtension(365)}
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Extend by 1 year
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Expiration List */}
      <Card>
        <CardHeader>
          <CardTitle>User Role Expirations</CardTitle>
          <CardDescription>
            View and manage expiration dates for all user role assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {userRoles.map((userRole) => {
              const status = getExpirationStatus(userRole);
              const expirationDate = userRole.expires_at ? new Date(userRole.expires_at) : null;

              return (
                <div
                  key={userRole.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="font-medium">{userRole.user_email || 'Unknown User'}</div>
                      <div className="text-sm text-muted-foreground">
                        Role: {userRole.role?.display_name || 'Unknown Role'}
                      </div>
                      {expirationDate && (
                        <div className="text-xs text-muted-foreground">
                          Expires: {format(expirationDate, 'PPP')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusBadge(status)}
                    
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          Set Expiration
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <div className="p-4 space-y-4">
                          <div className="space-y-2">
                            <Label>Quick Options</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetExpiration(userRole.id, getQuickExpirationDate(30))}
                              >
                                30 days
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetExpiration(userRole.id, getQuickExpirationDate(90))}
                              >
                                90 days
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetExpiration(userRole.id, getQuickExpirationDate(365))}
                              >
                                1 year
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetExpiration(userRole.id, null)}
                              >
                                Never
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Custom Date</Label>
                            <Calendar
                              mode="single"
                              selected={selectedDate}
                              onSelect={setSelectedDate}
                              disabled={(date) => isBefore(date, new Date())}
                              initialFocus
                            />
                            {selectedDate && (
                              <Button
                                className="w-full"
                                onClick={() => handleSetExpiration(userRole.id, selectedDate)}
                              >
                                Set to {format(selectedDate, 'PPP')}
                              </Button>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              );
            })}

            {userRoles.length === 0 && (
              <div className="text-center py-8">
                <Timer className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Role Assignments</h3>
                <p className="text-muted-foreground">
                  No user role assignments found to manage expiration dates for.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expiration Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Expiration Rules</CardTitle>
          <CardDescription>
            Configure default expiration policies for different roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {expirationRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <div className="font-medium">{rule.roleName}</div>
                  <div className="text-sm text-muted-foreground">
                    Default: {rule.defaultDuration} days • Max: {rule.maxDuration} days
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {rule.autoRenew && 'Auto-renewal enabled • '}
                    Notification: {rule.renewalNotice} days before expiry
                    {rule.requiresApproval && ' • Requires approval'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={rule.autoRenew ? 'default' : 'outline'}>
                    {rule.autoRenew ? 'Auto-renew' : 'Manual'}
                  </Badge>
                  <Button variant="outline" size="sm">
                    Edit Rule
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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