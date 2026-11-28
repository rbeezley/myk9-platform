import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase-client';
import { fetchShowEmailContent, type EmailDeliverySupabaseClient } from './api';
import { EMAIL_VIEWER_SANDBOX, emailHtmlForViewer } from './emailViewerHtml';

/** Copies are kept for emails sent from this date on (MYK9-2115). */
export const EMAIL_COPIES_KEPT_FROM = 'November 17, 2026';

export function ViewEmailButton({ emailLogId, label }: { emailLogId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => setOpen(true)}
      >
        View email
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <EmailContentBody emailLogId={emailLogId} label={label} enabled={open} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmailContentBody({
  emailLogId,
  label,
  enabled,
}: {
  emailLogId: string;
  label: string;
  enabled: boolean;
}) {
  const query = useQuery({
    queryKey: ['show-email-content', emailLogId],
    queryFn: () =>
      fetchShowEmailContent({
        supabase: supabase as unknown as EmailDeliverySupabaseClient,
        emailLogId,
      }),
    enabled,
    staleTime: Infinity,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{query.data?.subject ?? label}</DialogTitle>
        <DialogDescription>What this email said when it was sent.</DialogDescription>
      </DialogHeader>
      {query.fetchStatus === 'paused' || (query.isPending && !isOnline()) ? (
        <RetryNotice
          message="You’re offline. Connect to open this email."
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading email…
        </p>
      ) : query.isError ? (
        (query.error as { code?: string }).code === '42501' ? (
          <p className="text-sm text-destructive">You don’t have access to this show’s emails.</p>
        ) : (
          <RetryNotice
            message="This email isn’t available right now."
            onRetry={() => void query.refetch()}
          />
        )
      ) : query.data ? (
        // No scripts, forms or same-origin access for the email's html. Links open a new tab and
        // never navigate this frame (MYK9-2487); see `emailViewerHtml.ts`.
        <iframe
          title="Email preview"
          sandbox={EMAIL_VIEWER_SANDBOX}
          srcDoc={emailHtmlForViewer(query.data.html)}
          className="h-[60vh] w-full rounded-md border bg-white"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          A copy of this email was not kept. Emails sent after {EMAIL_COPIES_KEPT_FROM} can be
          opened here.
        </p>
      )}
    </>
  );
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function RetryNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div>
      <p className="text-sm text-destructive">{message}</p>
      <button
        type="button"
        className="mt-3 min-h-11 rounded-md border px-3 text-sm font-medium hover:bg-muted"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}
