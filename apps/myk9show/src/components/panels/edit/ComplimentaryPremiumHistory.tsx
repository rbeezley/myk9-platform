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
              {row.revoked_at && row.revoke_reason && (
                <p className="text-sm text-muted-foreground">
                  Revoked {formatDate(row.revoked_at)}: {row.revoke_reason}
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
