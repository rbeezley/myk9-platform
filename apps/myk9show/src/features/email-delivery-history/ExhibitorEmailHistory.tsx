import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { DeliveryHistoryRow } from './DeliveryHistoryRow';
import {
  fetchShowEmailDeliveryHistory,
  type EmailDeliveryCursor,
  type EmailDeliverySupabaseClient,
} from './api';
import { normalizeEmailDeliveryRow } from './readModel';

export interface ExhibitorEmailResend {
  /** The form's registration; "Resend confirmation" sends its confirmation again. */
  registrationId: string;
  onResend: (registrationId: string) => void;
  disabled: boolean;
}

interface ExhibitorEmailHistoryProps {
  showId: string;
  recipientEmail: string;
  /** Present only where the entry form already allows a resend. */
  resend?: ExhibitorEmailResend | undefined;
}

/**
 * MYK9-2403: one exhibitor's emails for one show, read from the same delivery history as
 * Messages → Email delivery (same RPC, same labels), narrowed to their address. It never says
 * "no emails sent" unless the server answered with none.
 */
export function ExhibitorEmailHistory({
  showId,
  recipientEmail,
  resend,
}: ExhibitorEmailHistoryProps) {
  const email = recipientEmail.trim();
  const query = useInfiniteQuery({
    queryKey: ['show-email-delivery-history', showId, email.toLowerCase()],
    queryFn: ({ pageParam }) =>
      fetchShowEmailDeliveryHistory({
        supabase: supabase as unknown as EmailDeliverySupabaseClient,
        showId,
        recipientEmail: email,
        cursor: pageParam,
      }),
    initialPageParam: null as EmailDeliveryCursor | null,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    enabled: email.length > 0,
    // Delivery status arrives by provider webhook; keep an open form current (as the Messages list does).
    refetchInterval: 60_000,
  });

  if (email.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        This exhibitor has no email address on file, so there is no delivery status to show.
      </p>
    );
  }

  const rows = query.data?.pages.flatMap(page => page.rows.map(normalizeEmailDeliveryRow)) ?? [];

  if (query.isPending) {
    const offline = query.fetchStatus === 'paused' || !isOnline();
    return offline ? (
      <p className="mt-3 text-sm text-muted-foreground" role="status">
        Delivery status needs a connection. Reconnect to see the emails sent to this exhibitor.
      </p>
    ) : (
      <p className="mt-3 text-sm text-muted-foreground" role="status">
        Loading emails…
      </p>
    );
  }

  if (query.isError && rows.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-sm text-muted-foreground">
          Delivery status needs a connection and isn’t available right now.
        </p>
        <button
          type="button"
          className="mt-2 min-h-11 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No emails sent to {email} for this show yet.
      </p>
    );
  }

  return (
    <>
      <div className="mt-3 space-y-3" role="list" aria-label="Emails sent to this exhibitor">
        {rows.map(row => (
          <DeliveryHistoryRow
            key={row.id}
            row={row}
            forExhibitor
            actions={
              resend && row.sourceKind === 'registration_confirmation' ? (
                <button
                  type="button"
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                  disabled={resend.disabled}
                  onClick={() => resend.onResend(resend.registrationId)}
                >
                  Resend confirmation
                </button>
              ) : undefined
            }
          />
        ))}
      </div>
      {query.hasNextPage ? (
        <button
          type="button"
          className="mt-3 min-h-11 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      ) : null}
    </>
  );
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}
