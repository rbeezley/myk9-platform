/**
 * RBAC Migration Status Component
 * Shows users the migration status from legacy to database-driven RBAC
 * Created: December 2024
 */

import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  Database,
  Shield,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';

function useMigratedAuth() {
  const context = useAuthContext();
  const isMigrated = context.dbRoles.length > 0;
  return {
    isMigrated,
    isLoading: context.rbacLoading,
    error: context.rbacError,
    migrationStatus: context.rbacError
      ? 'error'
      : ((isMigrated ? 'completed' : 'pending') as
          | 'pending'
          | 'in_progress'
          | 'completed'
          | 'failed'
          | 'error'),
    useDatabase: isMigrated,
    isLegacy: !isMigrated,
  };
}

interface RBACMigrationStatusProps {
  className?: string;
  showDetails?: boolean;
}

export const RBACMigrationStatus: React.FC<RBACMigrationStatusProps> = ({
  className = '',
  showDetails = false,
}) => {
  const { migrationStatus, useDatabase, isLegacy } = useMigratedAuth();
  const { dbRoles, rbacError, refreshPermissions } = useAuthContext();

  const getStatusInfo = () => {
    switch (migrationStatus) {
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'text-teal-600 dark:text-teal-400',
          bgColor: 'bg-teal-50 dark:bg-teal-950/30',
          borderColor: 'border-teal-200 dark:border-teal-800',
          title: 'RBAC Migration Complete',
          description: 'Your account is using the new database-driven permission system.',
          progress: 100,
        };
      case 'in_progress':
        return {
          icon: Loader2,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-950/30',
          borderColor: 'border-blue-200 dark:border-blue-800',
          title: 'Migrating to New RBAC System',
          description: 'Please wait while we update your permissions...',
          progress: 50,
        };
      case 'error':
        return {
          icon: AlertTriangle,
          color: 'text-destructive ',
          bgColor: 'bg-destructive/10 ',
          borderColor: 'border-destructive/30 ',
          title: 'Migration Error',
          description: 'There was an issue migrating your permissions. Using legacy system.',
          progress: 25,
        };
      default:
        return {
          icon: Info,
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-50 dark:bg-amber-950/30',
          borderColor: 'border-amber-200 dark:border-amber-800',
          title: 'Using Legacy RBAC System',
          description: 'Your account will be migrated to the new system automatically.',
          progress: 10,
        };
    }
  };

  const statusInfo = getStatusInfo();
  const Icon = statusInfo.icon;

  // Don't show anything if migration is complete and showDetails is false
  if (migrationStatus === 'completed' && !showDetails) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <Alert className={`${statusInfo.bgColor} ${statusInfo.borderColor}`}>
        <div className="flex items-start gap-3">
          <Icon
            className={`h-5 w-5 ${statusInfo.color} ${
              migrationStatus === 'in_progress' ? 'animate-spin' : ''
            }`}
          />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className={`font-medium ${statusInfo.color}`}>{statusInfo.title}</h4>
              <Badge
                variant={
                  migrationStatus === 'completed'
                    ? 'default'
                    : migrationStatus === 'in_progress'
                      ? 'secondary'
                      : migrationStatus === 'error'
                        ? 'destructive'
                        : 'outline'
                }
              >
                {migrationStatus.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>

            <AlertDescription className="text-sm">{statusInfo.description}</AlertDescription>

            {/* Progress bar for migration states */}
            {migrationStatus !== 'completed' && (
              <div className="space-y-2">
                <Progress value={statusInfo.progress} className="h-2" />
                <div className="text-xs text-muted-foreground">
                  Migration progress: {statusInfo.progress}%
                </div>
              </div>
            )}

            {/* Error details */}
            {rbacError && migrationStatus === 'error' && (
              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs">
                <strong>Error:</strong> {rbacError}
              </div>
            )}

            {/* Retry button for errors */}
            {migrationStatus === 'error' && (
              <Button size="sm" variant="outline" onClick={refreshPermissions} className="mt-2">
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry Migration
              </Button>
            )}
          </div>
        </div>
      </Alert>

      {/* Detailed information */}
      {showDetails && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-border rounded-lg space-y-2 bg-card">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600" />
              <span className="font-medium">Database Status</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {useDatabase ? (
                <span className="text-teal-600">✓ Using database permissions</span>
              ) : (
                <span className="text-amber-600">⚠ Using legacy permissions</span>
              )}
            </div>
          </div>

          <div className="p-4 border border-border rounded-lg space-y-2 bg-card">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-teal-600" />
              <span className="font-medium">Active Roles</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {dbRoles.length > 0 ? (
                <span>{dbRoles.length} database role(s)</span>
              ) : (
                <span>Using default roles</span>
              )}
            </div>
          </div>

          <div className="p-4 border border-border rounded-lg space-y-2 bg-card">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              <span className="font-medium">System Type</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {isLegacy ? 'Legacy RBAC' : 'Database RBAC'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Compact migration status for headers/navigation
 */
export const CompactMigrationStatus: React.FC = () => {
  const { migrationStatus } = useMigratedAuth();

  if (migrationStatus === 'completed') {
    return null;
  }

  const getStatusColor = () => {
    switch (migrationStatus) {
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-amber-100 text-amber-800';
    }
  };

  return (
    <Badge className={`text-xs ${getStatusColor()}`}>
      {migrationStatus === 'in_progress' && 'Migrating...'}
      {migrationStatus === 'error' && 'Migration Error'}
      {migrationStatus === 'pending' && 'Legacy Mode'}
    </Badge>
  );
};

export default RBACMigrationStatus;
