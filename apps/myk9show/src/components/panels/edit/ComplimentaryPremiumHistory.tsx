import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  AdminGrantHistoryRow,
  SanitizedGrantStatus,
} from '@/services/database/entitlement/types';

import { deriveGrantStatus } from './complimentaryPremiumGrantStatus';

const STATUS_BADGE_VARIANT: Record<
  SanitizedGrantStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  scheduled: 'secondary',
  expired: 'outline',
  revoked: 'destructive',
  superseded: 'outline',
};

const formatDate = (value: string) => new Date(value).toLocaleDateString();

/** Grant/revoke event stamps carry a time of day that matters for audit. */
const formatDateTime = (value: string) => new Date(value).toLocaleString();

/**
 * Actor person ids are shown raw and labelled. There is no cheap admin
 * people-by-id lookup to reuse here (`getUserById` pulls dogs and judge
 * qualifications per call), and per the audit requirement an unresolved actor
 * must still be displayed rather than omitted.
 */
const formatActor = (personId: string | null) => personId ?? 'unknown actor';

interface ComplimentaryPremiumHistoryProps {
  rows: AdminGrantHistoryRow[];
  isLoading: boolean;
  onRevoke: (row: AdminGrantHistoryRow) => void;
  revokeDisabled: boolean;
}

export const ComplimentaryPremiumHistory: React.FC<ComplimentaryPremiumHistoryProps> = ({
  rows,
  isLoading,
  onRevoke,
  revokeDisabled,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="grant-history-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No grant history for this user.</p>;
  }

  const now = new Date();

  return (
    <ul className="space-y-3" aria-label="Grant history">
      {rows.map(row => {
        const status = deriveGrantStatus(row, now);
        const canRevoke = status === 'active' || status === 'scheduled';
        return (
          <li
            key={row.id}
            className="flex flex-col gap-2 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_BADGE_VARIANT[status]} className="capitalize">
                  {status}
                </Badge>
                <span className="text-sm font-medium capitalize">{row.grant_type}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(row.starts_at)} – {formatDate(row.ends_at)}
              </p>
              <p className="text-sm">{row.reason}</p>
              <p className="text-xs text-muted-foreground">
                Granted by {formatActor(row.granted_by_person_id)} on{' '}
                {formatDateTime(row.created_at)}
              </p>
              {row.revoked_at && (
                <p className="text-xs text-muted-foreground">
                  Revoked by {formatActor(row.revoked_by_person_id)} on{' '}
                  {formatDateTime(row.revoked_at)}
                  {row.revoke_reason ? `: ${row.revoke_reason}` : ''}
                </p>
              )}
            </div>
            {canRevoke && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={revokeDisabled}
                onClick={() => onRevoke(row)}
              >
                Revoke
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default ComplimentaryPremiumHistory;
