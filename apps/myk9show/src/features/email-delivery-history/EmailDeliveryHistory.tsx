import { useInfiniteQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { DeliveryHistoryRow } from './DeliveryHistoryRow';
import {
  fetchShowEmailDeliveryHistory,
  type EmailDeliveryCursor,
  type EmailDeliverySupabaseClient,
} from './api';
import { normalizeEmailDeliveryRow } from './readModel';

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
    // current without adding a second client-side status authority. Server-only,
    // secretary-only, while open: 60 s is current enough (MYK9-1368).
    refetchInterval: 60_000,
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
