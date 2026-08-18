import { useInfiniteQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, HelpCircle, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import {
  fetchShowEmailDeliveryHistory,
  type EmailDeliveryCursor,
  type EmailDeliverySupabaseClient,
} from './api';
import {
  getEmailDeliveryStatusPresentation,
  normalizeEmailDeliveryRow,
  type EmailDeliveryHistoryRow,
} from './readModel';

export function EmailDeliveryHistory({ showId }: { showId: string | null }) {
  const historyQuery = useInfiniteQuery({
    queryKey: ['show-email-delivery-history', showId],
    queryFn: ({ pageParam }) =>
      fetchShowEmailDeliveryHistory({
        supabase: supabase as unknown as EmailDeliverySupabaseClient,
        showId: showId as string,
        cursor: pageParam,
      }),
    initialPageParam: null as EmailDeliveryCursor | null,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    enabled: Boolean(showId),
    // Resend webhook updates are the delivery truth. Keep an open history
    // current without adding a second client-side status authority.
    refetchInterval: 15_000,
  });

  if (!showId) {
    return (
      <section aria-labelledby="delivery-history-heading" className="rounded-lg border p-4">
        <HistoryHeading />
        <p className="mt-2 text-sm text-muted-foreground">
          Select a show to view its email delivery history.
        </p>
      </section>
    );
  }

  const rows =
    historyQuery.data?.pages.flatMap(page => page.rows.map(normalizeEmailDeliveryRow)) ?? [];

  return (
    <section aria-labelledby="delivery-history-heading" className="rounded-lg border p-4">
      <HistoryHeading />
      {historyQuery.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading email delivery history…
        </p>
      ) : historyQuery.isError ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">
            Email delivery history isn’t available right now. Try again.
          </p>
          <button
            type="button"
            className="mt-3 min-h-11 rounded-md border px-3 text-sm font-medium hover:bg-muted"
            onClick={() => void historyQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No show emails have been sent yet.</p>
      ) : (
        <>
          <div className="mt-4 space-y-3" role="list" aria-label="Email delivery attempts">
            {rows.map(row => (
              <DeliveryHistoryRow key={row.id} row={row} />
            ))}
          </div>
          {historyQuery.hasNextPage ? (
            <button
              type="button"
              className="mt-4 min-h-11 rounded-md border px-3 text-sm font-medium hover:bg-muted"
              onClick={() => void historyQuery.fetchNextPage()}
              disabled={historyQuery.isFetchingNextPage}
            >
              {historyQuery.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function HistoryHeading() {
  return (
    <div className="flex items-start gap-3">
      <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <h2 id="delivery-history-heading" className="text-base font-semibold">
          Delivery history
        </h2>
        <p className="text-sm text-muted-foreground">
          One row per email attempt. Delivery status comes from the email provider.
        </p>
      </div>
    </div>
  );
}

function DeliveryHistoryRow({ row }: { row: EmailDeliveryHistoryRow }) {
  const presentation = getEmailDeliveryStatusPresentation(row.status);
  const needsAttention = ['bounced', 'failed', 'complained'].includes(row.status);

  return (
    <article className="rounded-md border p-3" role="listitem" data-testid="delivery-history-row">
      <div className="flex items-start gap-3">
        <StatusIcon status={presentation.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-medium">{row.typeLabel}</h3>
            <time className="text-sm text-muted-foreground" dateTime={row.relevantAt}>
              {formatAttemptTime(row.relevantAt)}
            </time>
          </div>
          <p className="mt-1 break-words text-sm">{row.recipient}</p>
          <p className="mt-1 text-sm font-medium">{row.statusLabel}</p>
          {needsAttention ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {row.failureSummary ?? presentation.description}
            </p>
          ) : null}
          {needsAttention && row.recoveryHref ? (
            <Link
              to={row.recoveryHref}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Review this email
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function StatusIcon({ status }: { status: EmailDeliveryHistoryRow['status'] }) {
  const Icon =
    status === 'delivered'
      ? CheckCircle2
      : status === 'sent'
        ? Clock3
        : status === 'unavailable'
          ? HelpCircle
          : AlertTriangle;
  return <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />;
}

function formatAttemptTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
