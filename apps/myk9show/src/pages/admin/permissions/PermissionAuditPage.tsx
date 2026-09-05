/**
 * View the audit trail for permission changes.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { History, Filter, Calendar, Shield, Settings, Download, RefreshCw } from 'lucide-react';
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
import type { PermissionAuditLog } from '@/types/rbac-types';
import { formatDistanceToNow } from 'date-fns';
import {
  classifyAuditAction,
  getAuditActionTone,
  summarizeAuditActions,
} from './permissionAuditClassification';

// Icons and badges are keyed off the same explicit action-code contract as the
// summary (permissionAuditClassification.ts). They previously switched on codes
// like 'assign_role' and 'grant_permission', which no writer emits — so every
// real row fell through to the neutral default (MYK9-396).
function getActionIcon(actionType: string) {
  const family = classifyAuditAction(actionType);
  const tone = getAuditActionTone(actionType);

  if (family === 'other' || tone === 'neutral') {
    return <History className="h-4 w-4 text-muted-foreground" />;
  }

  const Icon = family === 'role' ? Shield : Settings;
  return (
    <Icon
      className={`h-4 w-4 ${tone === 'revoke' ? 'text-destructive' : 'text-primary'}`}
    />
  );
}

function formatAction(action: string) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function getActionBadgeVariant(actionType: string) {
  if (classifyAuditAction(actionType) === 'other') return 'outline';
  const tone = getAuditActionTone(actionType);
  if (tone === 'grant') return 'default';
  if (tone === 'revoke') return 'destructive';
  return 'secondary';
}

function getAuditDetails(log: PermissionAuditLog): Record<string, unknown> | null {
  return log.new_value ?? log.old_value;
}

const columns: ColumnDef<PermissionAuditLog, unknown>[] = [
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {getActionIcon(row.original.action)}
        <Badge variant={getActionBadgeVariant(row.original.action) as 'default'}>
          {formatAction(row.original.action)}
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
          <div
            className="max-w-40 truncate font-mono text-sm text-muted-foreground"
            title={row.original.user_id}
          >
            {row.original.user_id}
          </div>
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
            <span className="font-mono text-sm font-medium">{row.original.target_id}</span>
          </div>
        )}
      </div>
    ),
  },
  {
    id: 'details',
    header: 'Details',
    meta: { responsiveHide: 'lg' } satisfies DataTableColumnMeta,
    accessorFn: row => {
      const details = getAuditDetails(row);
      return details
        ? Object.entries(details)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(' ')
        : '';
    },
    cell: ({ row }) => {
      const details = getAuditDetails(row.original);
      if (!details) return null;
      return (
        <div className="text-sm">
          {Object.entries(details).map(([key, value]) => (
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
        <div className="text-sm text-muted-foreground">
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
    } catch {
      setError("We couldn't load the permission history.");
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
      ...filteredLogs.map(log => {
        const details = getAuditDetails(log);
        return [
          log.created_at ? new Date(log.created_at).toISOString() : '',
          log.action ?? '',
          log.user_id ?? 'System',
          log.target_type ?? '',
          log.target_id ?? '',
          details ? JSON.stringify(details) : '',
        ]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',');
      }),
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

  // Summarise the FILTERED rows, not every fetched row — the headline sits
  // directly above the table and must agree with what it is summarising.
  const auditSummary = useMemo(() => summarizeAuditActions(filteredLogs), [filteredLogs]);

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-background"
        role="status"
        aria-label="Loading permission history"
        aria-busy="true"
      >
        <div className="container mx-auto max-w-7xl px-6 pb-8 pt-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="h-8 bg-muted rounded-lg w-64 animate-pulse" />
              <div className="h-4 bg-muted rounded w-96 animate-pulse" />
            </div>
            <div className="rounded-xl border bg-card p-5">
              <div className="h-11 animate-pulse rounded bg-muted" />
              <div className="mt-4 h-64 animate-pulse rounded bg-muted" />
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                <History className="h-6 w-6 text-primary" />
                Permission Audit
              </h1>
              <p className="text-muted-foreground mt-2">
                Review role and permission changes across the platform.
              </p>
            </div>
            <Button variant="outline" className="h-11" onClick={() => void loadAuditLogs()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{error}</span>
                <Button variant="outline" className="h-11" onClick={() => void loadAuditLogs()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
            <span className="font-medium">
              {auditSummary.total} {auditSummary.total === 1 ? 'change' : 'changes'}
            </span>
            <span aria-hidden="true" className="text-border">
              •
            </span>
            <span className="text-muted-foreground">
              {auditSummary.roleChanges}{' '}
              {auditSummary.roleChanges === 1 ? 'role change' : 'role changes'}
            </span>
            <span aria-hidden="true" className="text-border">
              •
            </span>
            <span className="text-muted-foreground">
              {auditSummary.permissionChanges}{' '}
              {auditSummary.permissionChanges === 1 ? 'permission change' : 'permission changes'}
            </span>
            {auditSummary.otherChanges > 0 && (
              <>
                <span aria-hidden="true" className="text-border">
                  •
                </span>
                <span className="text-muted-foreground">
                  {auditSummary.otherChanges} other
                </span>
              </>
            )}
          </div>

          <div>
            <DataTable
              tableId="permissionAudit"
              scrollAreaLabel="Permission audit log table"
              columns={columns}
              data={filteredLogs}
              initialSorting={[{ id: 'created_at', desc: true }]}
              emptyState={
                <div className="text-center py-8">
                  <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No audit events found</h3>
                  <p className="text-muted-foreground">
                    Try a wider date range or clear the action filter.
                  </p>
                </div>
              }
              toolbar={({ table }) => (
                <DataTableToolbar table={table}>
                  <DataTableSearch placeholder="Search audit logs..." />
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="h-11 w-full text-sm sm:w-40" aria-label="Date range">
                      <Calendar className="mr-2 h-4 w-4" />
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
                    <SelectTrigger
                      className="h-11 w-full text-sm sm:w-44"
                      aria-label="Action filter"
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Filter by action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      {actionTypes.map(actionType => (
                        <SelectItem key={actionType} value={actionType}>
                          {formatAction(actionType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DataTableColumnToggle />
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={filteredLogs.length === 0}
                    onClick={handleExport}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </DataTableToolbar>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionAuditPage;
