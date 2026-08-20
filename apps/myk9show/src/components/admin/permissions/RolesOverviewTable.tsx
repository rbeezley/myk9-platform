/**
 * Roles table for the Roles & Permissions overview.
 *
 * A NAVIGATION surface, not an editing one: every row links into the existing
 * /admin/permissions/roles/:roleId editor. Do not add inline create, edit, or
 * delete affordances here — that is the duplication this table exists to end.
 * See docs/plan-permissions-overview-roles-console.md.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import type { Role } from '@/types/rbac-types';
import { filterRoles, getRoleDisplayName, getRoleTypeLabel } from './rolesOverview';

export interface RolesOverviewTableProps {
  roles: Role[];
  /** Role id -> ISO timestamp, from buildLastChangedMap. */
  lastChanged: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const RolesOverviewTable: React.FC<RolesOverviewTableProps> = ({
  roles,
  lastChanged,
  isLoading,
  error,
  onRetry,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const visibleRoles = useMemo(() => filterRoles(roles, searchTerm), [roles, searchTerm]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button variant="outline" className="h-11" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div
        className="rounded-xl border bg-card p-4"
        role="status"
        aria-label="Loading roles"
        aria-busy="true"
      >
        <TableSkeleton rows={6} columns={5} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search roles"
            placeholder="Search roles"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            className="h-11 pl-10"
          />
        </div>
        <p className="text-muted-foreground">
          {visibleRoles.length === roles.length
            ? `${roles.length} roles`
            : `${visibleRoles.length} of ${roles.length} roles`}
        </p>
      </div>

      {/* An empty system and an empty search result are different states:
          only one of them has a search to clear. */}
      {roles.length === 0 ? (
        <div className="p-10 text-center">
          <p className="font-medium">No roles defined yet</p>
          <p className="mt-1 text-muted-foreground">
            Roles decide what each person can do. Start with one.
          </p>
          <Button asChild variant="outline" className="mt-4 h-11">
            <Link to="/admin/permissions/roles/new">Create the first role</Link>
          </Button>
        </div>
      ) : visibleRoles.length === 0 ? (
        <div className="p-10 text-center">
          <p className="font-medium">No roles match "{searchTerm}"</p>
          <Button variant="outline" className="mt-4 h-11" onClick={() => setSearchTerm('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  Type
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-semibold text-muted-foreground"
                >
                  Members
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-semibold text-muted-foreground"
                >
                  Permissions
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell"
                >
                  Last changed
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRoles.map(role => {
                const changedAt = lastChanged.get(role.id);
                return (
                  <tr
                    key={role.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/permissions/roles/${role.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 font-medium"
                      >
                        <span>
                          {getRoleDisplayName(role)}
                          {role.description && (
                            <span className="mt-0.5 block font-normal text-muted-foreground">
                              {role.description}
                            </span>
                          )}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                        {getRoleTypeLabel(role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {role.user_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {role.permission_count ?? 0}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {changedAt
                        ? formatDistanceToNow(new Date(changedAt), { addSuffix: true })
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
