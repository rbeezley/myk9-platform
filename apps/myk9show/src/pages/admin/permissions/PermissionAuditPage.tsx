/**
 * Permission Audit Log Page
 * Phase 3.5: View audit trail of permission changes
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  History,
  Filter,
  Calendar,
  User,
  Shield,
  Settings,
  Download,
  RefreshCw,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DataTable,
  DataTableToolbar,
  DataTableSearch,
  DataTableColumnToggle,
  type ColumnDef,
} from '@/components/ui/data-table';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import { rbacService } from '@/services/rbac/RBACService';
import { PermissionAuditLog } from '@/types/rbac-types';
import { formatDistanceToNow } from 'date-fns';

function getActionIcon(actionType: string) {
  switch (actionType) {
    case 'assign_role':
    case 'create_role':
      return <Shield className="h-4 w-4 text-green-600" />;
    case 'revoke_role':
    case 'delete_role':
      return <Shield className="h-4 w-4 text-red-600" />;
    case 'grant_permission':
      return <Settings className="h-4 w-4 text-blue-600" />;
    case 'revoke_permission':
      return <Settings className="h-4 w-4 text-orange-600" />;
    default:
      return <History className="h-4 w-4 text-gray-600" />;
  }
}

function getActionBadgeVariant(actionType: string) {
  const variants = {
    assign_role: 'default',
    revoke_role: 'destructive',
    grant_permission: 'default',
    revoke_permission: 'secondary',
    create_role: 'default',
    delete_role: 'destructive',
    update_role: 'secondary',
  } as const;
  return variants[actionType as keyof typeof variants] || 'outline';
}

const columns: ColumnDef<PermissionAuditLog, unknown>[] = [
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {getActionIcon(row.original.action)}
        <Badge variant={getActionBadgeVariant(row.original.action) as 'default'}>
          {row.original.action.replace('_', ' ').toUpperCase()}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: 'user_id',
    header: 'Actor',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.user_id ? 'User' : 'System'}</div>
        {row.original.user_id && (
          <div className="text-xs text-muted-foreground font-mono">{row.original.user_id}</div>
        )}
      </div>
    ),
  },
  {
    id: 'target',
    header: 'Target',
    accessorFn: row => `${row.target_type ?? ''} ${row.target_id ?? ''}`,
    meta: { responsiveHide: 'md' } satisfies DataTableColumnMeta,
    cell: ({ row }) => (
      <div className="space-y-1">
        {row.original.target_id && row.original.target_type && (
          <div className="text-sm">
            {row.original.target_type}:{' '}
            <span className="font-medium font-mono text-xs">{row.original.target_id}</span>
          </div>
        )}
      </div>
    ),
  },
  {
    id: 'details',
    header: 'Details',
    meta: { responsiveHide: 'lg' } satisfies DataTableColumnMeta,
    accessorFn: row =>
      row.new_value && typeof row.new_value === 'object'
        ? Object.entries(row.new_value)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(' ')
        : '',
    cell: ({ row }) => {
      const val = row.original.new_value;
      if (!val || typeof val !== 'object') return null;
      return (
        <div className="text-xs">
          {Object.entries(val).map(([key, value]) => (
            <div key={key}>
              <span className="text-muted-foreground">{key}:</span> {String(value)}
            </div>
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Time',
    cell: ({ row }) => (
      <div>
        <div className="text-sm">
          {row.original.created_at
            ? formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })
            : 'N/A'}
        </div>
        <div className="text-xs text-muted-foreground">
          {row.original.created_at ? new Date(row.original.created_at).toLocaleTimeString() : ''}
        </div>
      </div>
    ),
    sortingFn: (rowA, rowB) => {
      const a = new Date(rowA.original.created_at || 0).getTime();
      const b = new Date(rowB.original.created_at || 0).getTime();
      return a - b;
    },
  },
];

const PermissionAuditPage: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<PermissionAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7d');

  const loadAuditLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const now = new Date();
      const daysBack =
        dateRange === '1d'
          ? 1
          : dateRange === '7d'
            ? 7
            : dateRange === '30d'
              ? 30
              : dateRange === '90d'
                ? 90
                : 7;

      const fromDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

      const logs = await rbacService.getAuditLogs({
        fromDate: fromDate.toISOString(),
        toDate: now.toISOString(),
        limit: 1000,
      });

      setAuditLogs(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleExport = () => {
    const csvRows = [
      ['Date', 'Action', 'Actor', 'Target Type', 'Target ID', 'Details'].join(','),
      ...filteredLogs.map(log =>
        [
          log.created_at ? new Date(log.created_at).toISOString() : '',
          log.action ?? '',
          log.user_id ?? 'System',
          log.target_type ?? '',
          log.target_id ?? '',
          log.new_value ? JSON.stringify(log.new_value) : '',
        ]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter by action type (date range is handled by API call)
  const filteredLogs = useMemo(
    () =>
      actionFilter === 'all' ? auditLogs : auditLogs.filter(log => log.action === actionFilter),
    [auditLogs, actionFilter]
  );

  // Get unique action types for filter
  const actionTypes = useMemo(
    () => [...new Set(auditLogs.map(log => log.action))].sort(),
    [auditLogs]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
          <div className="space-y-8">
            {/* Header Skeleton */}
            <div className="space-y-3">
              <div className="h-8 bg-muted rounded-lg w-64 animate-pulse" />
              <div className="h-4 bg-muted rounded w-96 animate-pulse" />
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="p-6 rounded-2xl border bg-card">
                  <div className="space-y-3">
                    <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                    <div className="h-8 bg-muted rounded w-16 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-20 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>

            {/* Content Skeleton */}
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-6 rounded-2xl border bg-card">
                  <div className="space-y-3">
                    <div className="h-5 bg-muted rounded w-48 animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <History className="h-8 w-8 text-primary" />
                Permission Audit Log
              </h1>
              <p className="text-muted-foreground mt-2">
                Track all permission and role changes in the system
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => loadAuditLogs()}
              className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40
                         hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <div className="relative flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Total Events
                  </p>
                  <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                    {auditLogs.length}
                  </p>
                </div>
                <div
                  className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300"
                >
                  <History className="h-5 w-5 text-primary" />
                </div>
              </div>
            </Card>

            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <div className="relative flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Role Changes
                  </p>
                  <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                    {auditLogs.filter(log => log.action.includes('role')).length}
                  </p>
                </div>
                <div
                  className="p-2 bg-gradient-to-br from-green-500/20 to-green-500/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300"
                >
                  <Shield className="h-5 w-5 text-green-500" />
                </div>
              </div>
            </Card>

            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <div className="relative flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Permission Changes
                  </p>
                  <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                    {auditLogs.filter(log => log.action.includes('permission')).length}
                  </p>
                </div>
                <div
                  className="p-2 bg-gradient-to-br from-purple-500/20 to-purple-500/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300"
                >
                  <Settings className="h-5 w-5 text-purple-500" />
                </div>
              </div>
            </Card>

            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <div className="relative flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Unique Users
                  </p>
                  <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                    {new Set(auditLogs.map(log => log.user_id)).size}
                  </p>
                </div>
                <div
                  className="p-2 bg-gradient-to-br from-orange-500/20 to-orange-500/10 rounded-xl
                             shadow-sm group-hover:shadow-xl group-hover:scale-110
                             transition-all duration-300"
                >
                  <User className="h-5 w-5 text-orange-500" />
                </div>
              </div>
            </Card>
          </div>

          {/* Audit Log DataTable */}
          <DataTable
            tableId="permissionAudit"
            columns={columns}
            data={filteredLogs}
            initialSorting={[{ id: 'created_at', desc: true }]}
            emptyState={
              <div className="text-center py-8">
                <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No audit events found</h3>
                <p className="text-muted-foreground">No audit events in the selected time range</p>
              </div>
            }
            toolbar={({ table }) => (
              <DataTableToolbar table={table}>
                <DataTableSearch placeholder="Search audit logs..." />
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="w-40 h-8 text-xs" aria-label="Date range">
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">Last 24 hours</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-44 h-8 text-xs" aria-label="Action filter">
                    <Filter className="h-3.5 w-3.5 mr-1" />
                    <SelectValue placeholder="Filter by action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {actionTypes.map(actionType => (
                      <SelectItem key={actionType} value={actionType}>
                        {actionType.replace('_', ' ').toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DataTableColumnToggle />
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export
                </Button>
              </DataTableToolbar>
            )}
          />
        </div>
      </div>
    </div>
  );
};

export default PermissionAuditPage;
