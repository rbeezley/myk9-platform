import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { PageShell } from '@/components/common/PageShell';
import { useAuthContext } from '@/hooks/useAuthContext';
import { formatShortDate } from '@/lib/format/dates';
import { SupportTicketThread } from '@/features/support/SupportTicketThread';
import { useSupportTickets } from '@/features/support/useSupportTickets';

export default function SupportTicketPage() {
  const { user } = useAuthContext();
  const [searchParams] = useSearchParams();
  const ticketId = searchParams.get('ticketId');
  const tickets = useSupportTickets();
  const ticket = tickets.data?.find(item => item.id === ticketId) ?? null;

  return (
    <PageShell maxWidth="max-w-4xl">
      <PageHeader
        breadcrumbs={[
          { label: 'Account', href: '/account' },
          { label: 'Support', href: '/support' },
        ]}
        title="Support"
        actions={
          <Button variant="outline" asChild>
            <Link to="/account">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <section className="rounded-md border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold">Support</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Replies from the myK9Show team appear here.
            </p>
          </div>
          {ticket && <StatusBadge status={ticket.status} />}
        </div>

        {tickets.isLoading && (
          <div className="mt-6 space-y-2 animate-pulse">
            <div className="h-12 rounded-md bg-muted" />
            <div className="h-32 rounded-md bg-muted" />
          </div>
        )}

        {tickets.error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>
              {tickets.error instanceof Error
                ? tickets.error.message
                : 'Could not load your support ticket.'}
            </AlertDescription>
          </Alert>
        )}

        {!tickets.isLoading && !ticket && (
          <div className="mt-6 rounded-md border border-border bg-background p-6 text-center">
            <h3 className="text-base font-semibold">Ticket not found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The ticket may have been closed or may belong to another account.
            </p>
          </div>
        )}

        {ticket && user && (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-border bg-background p-4">
              <h3 className="text-base font-semibold">{ticket.subject}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Opened {formatShortDate(ticket.createdAt)}
              </p>
            </div>
            <SupportTicketThread ticketId={ticket.id} currentUserId={user.id} />
          </div>
        )}
      </section>
    </PageShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status === 'waiting' ? 'Waiting on you' : status;
  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
      {label}
    </span>
  );
}
