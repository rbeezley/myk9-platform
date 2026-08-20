/**
 * Recent access changes rail for the Roles & Permissions overview.
 *
 * A read-only window onto the newest permission_audit_log rows; the Permission
 * Audit tab remains the full, filterable surface. Secondary to the roles
 * table, so an audit fetch failure degrades to the empty state rather than
 * raising an alert that would outshout the primary content.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, History } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditLogEntry } from '@/types/rbac-types';

export interface RecentAccessChangesProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
}

const MAX_ENTRIES = 5;

function formatAction(action: string): string {
  return action.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

/** Grant-shaped actions read as additions, revoke-shaped ones as removals. */
function getDotClass(action: string): string {
  if (action.includes('revoke') || action.includes('delete')) return 'bg-destructive';
  if (action.includes('assign') || action.includes('grant') || action.includes('create'))
    return 'bg-success';
  return 'bg-warning';
}

export const RecentAccessChanges: React.FC<RecentAccessChangesProps> = ({ entries, isLoading }) => (
  <section aria-labelledby="recent-access-heading" className="rounded-xl border bg-card">
    <div className="flex items-center justify-between gap-3 border-b border-border p-4">
      <h2 id="recent-access-heading" className="font-semibold">
        Recent access changes
      </h2>
      <History className="h-4 w-4 text-muted-foreground" />
    </div>

    {isLoading ? (
      <div
        className="space-y-3 p-4"
        role="status"
        aria-label="Loading recent changes"
        aria-busy="true"
      >
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    ) : entries.length === 0 ? (
      <p className="p-4 text-muted-foreground">No access changes recorded yet.</p>
    ) : (
      <ul className="divide-y divide-border">
        {entries.slice(0, MAX_ENTRIES).map(entry => (
          <li key={entry.id} className="flex gap-3 p-4">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getDotClass(entry.action)}`}
            />
            <div className="min-w-0">
              <p className="font-medium">{formatAction(entry.action)}</p>
              <p className="text-muted-foreground">
                {entry.target_display ?? entry.target_type ?? 'Access change'}
                {entry.created_at
                  ? ` · ${formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}`
                  : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    )}

    <div className="border-t border-border p-2">
      <Link
        to="/admin/permissions?tab=audit"
        className="flex min-h-11 items-center justify-center gap-2 font-medium text-primary"
      >
        View full audit
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  </section>
);
