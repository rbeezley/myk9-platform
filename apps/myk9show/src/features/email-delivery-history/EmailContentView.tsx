import { useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fetchShowEmailContent, type EmailContent, type EmailDeliverySupabaseClient } from './api';

/**
 * "Read this email" on a Delivery history row (MYK9-1999): what the email said, read on demand so
 * the list stays light. The HTML is shown in a sandboxed frame (no scripts, no forms, no
 * navigation), exactly as it was sent.
 */
export function EmailContentView({ emailLogId }: { emailLogId: string }) {
  const [open, setOpen] = useState(false);
  const content = useQuery({
    queryKey: ['show-email-content', emailLogId],
    queryFn: () =>
      fetchShowEmailContent({
        supabase: supabase as unknown as EmailDeliverySupabaseClient,
        emailLogId,
      }),
    enabled: open,
    staleTime: Infinity,
    retry: false,
  });

  return (
    <div className="mt-2">
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {open ? 'Hide this email' : 'Read this email'}
      </button>
      {open ? <EmailContentBody query={content} /> : null}
    </div>
  );
}

function EmailContentBody({ query }: { query: UseQueryResult<EmailContent | null> }) {
  if (query.isPending) {
    return (
      <p className="mt-2 text-sm text-muted-foreground" role="status">
        Loading the email…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        What this email said is not available here.
      </p>
    );
  }
  const email = query.data;
  if (!email || (!email.bodyHtml && !email.bodyText)) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        What this email said was not recorded. Emails sent before November 2026 kept only their
        delivery status.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
      {email.subject ? (
        <p className="text-sm">
          <span className="font-medium">Subject:</span> {email.subject}
        </p>
      ) : null}
      {email.bodyHtml ? (
        <iframe
          title={email.subject ? `Email: ${email.subject}` : 'Email as sent'}
          sandbox=""
          srcDoc={email.bodyHtml}
          className="h-[32rem] w-full rounded border bg-white"
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{email.bodyText}</p>
      )}
    </div>
  );
}
