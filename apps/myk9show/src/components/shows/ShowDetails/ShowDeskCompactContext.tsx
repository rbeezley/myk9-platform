import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { ArmbandLookup } from '@/components/shows/ArmbandLookup';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';
import { ShowPresenceStack } from '@/features/show-presence/ShowPresenceStack';
import { classifyPremiumPublishState } from '@/features/show-workbench/premiumPublishState';
import { SETUP_PUBLISH_ANCHOR } from '@/features/show-workbench/setupReadinessSignals';
import { usePublishInfo } from '@/features/premium/usePublishInfo';
import { SHOW_STATUS_CONTROL_ANCHOR } from '@/features/show-workbench/publishReadiness';
import { formatShowDateRange } from '@/lib/format/dates';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import type { Show } from '@/types/show-types';

function ShowDeskSyncStatus() {
  const sync = useGlobalSyncStatus();
  const isOffline = sync.status === 'offline';
  const needsAttention = sync.status === 'error' || sync.status === 'conflict';
  const isPending = sync.status === 'pending';
  const Icon = isOffline
    ? WifiOff
    : needsAttention
      ? AlertCircle
      : isPending
        ? RefreshCw
        : CheckCircle2;
  const label = isOffline
    ? 'Offline · changes saved on this device'
    : needsAttention
      ? 'Sync needs attention'
      : isPending
        ? `${sync.queueSize} ${sync.queueSize === 1 ? 'change' : 'changes'} saved on this device`
        : 'All changes saved';

  return (
    <span
      className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-muted/35 px-3 text-sm text-muted-foreground"
      role="status"
    >
      <Icon className={isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      {label}
    </span>
  );
}

export function ShowDeskCompactContext({
  show,
  canonicalShowHref,
  armbandCount,
  onEdit,
  onDelete,
}: {
  show: Show;
  canonicalShowHref: string;
  armbandCount: number | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: publishInfo } = usePublishInfo(show.id);
  /**
   * `undefined` means the publish read did not succeed -- this query has no
   * `networkMode`, so it inherits 'online' and pauses offline, returning
   * undefined with `isLoading` false.
   *
   * `classifyPremiumPublishState` reads an absent URL as "not published", so an
   * unread response produced a persistent amber "Premium list is not published"
   * warning on shows whose premium went out weeks ago. Same defect class as the
   * counts above, with the polarity inverted: a false ALARM rather than a false
   * all-clear, and no less corrosive on a show-day desk where every warning is
   * meant to be worth acting on.
   */
  const publishInfoKnown = publishInfo !== undefined;
  const publishState = classifyPremiumPublishState({
    publishedPremiumUrl: publishInfo?.publishedUrl,
    publishedPremiumAt: publishInfo?.publishedAt,
    updatedAt: publishInfo?.updatedAt,
  });
  const publishException = !publishInfoKnown
    ? null
    : publishState === 'unpublished'
      ? 'Premium list is not published'
      : publishState === 'published-stale'
        ? 'Show data changed after the premium was published'
        : null;

  return (
    <section
      aria-label="Show Desk context"
      className="rounded-xl border bg-card px-4 py-3 text-card-foreground shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Link to="/shows" className="hover:text-foreground hover:underline">
              Shows
            </Link>
            <span aria-hidden="true">/</span>
            <Link to={canonicalShowHref} className="hover:text-foreground hover:underline">
              Overview
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium uppercase tracking-[0.12em] text-primary">Show Desk</span>
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {show.name || 'Untitled Show'}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[show.clubName, formatShowDateRange(show.startDate, show.endDate)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Shown whenever the count is positive OR UNKNOWN. `?? 0` hid the
              control entirely when the count could not be read, which is the
              false-zero pattern in its most awkward form: a missing affordance
              gives the secretary nothing to retry. */}
          {(armbandCount == null || armbandCount > 0) && <ArmbandLookup showId={show.id} />}
          <ShowDeskSyncStatus />
          <OfflineReadyBadge showId={show.id} />
          <LiveUpdateIndicator />
          <ShowPresenceStack />
          <span id={SHOW_STATUS_CONTROL_ANCHOR} className="scroll-mt-20">
            <ShowStatusPill showId={show.id} status={show.status} clubId={show.clubId} />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-lg" aria-label="More show actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`${canonicalShowHref}?preview=public`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview as exhibitor
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {publishException && (
        <Link
          to={`${canonicalShowHref}#${SETUP_PUBLISH_ANCHOR}`}
          className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning hover:brightness-95"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{publishException}</span>
          <span className="ml-auto">Review show details</span>
        </Link>
      )}
    </section>
  );
}
