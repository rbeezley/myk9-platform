import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, LifeBuoy, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { PageShell } from '@/components/common/PageShell';
import { useAuthContext } from '@/hooks/useAuthContext';
import { formatShortDate } from '@/lib/format/dates';
import { SupportTicketThread } from '@/features/support/SupportTicketThread';
import {
  useSupportTickets,
  useUpdateSupportTicketStatus,
} from '@/features/support/useSupportTickets';
import type { SupportTicket, SupportTicketStatus } from '@/features/support/supportTickets';

type SupportTicketFilter = SupportTicketStatus | 'all';

const FILTERS: SupportTicketFilter[] = ['open', 'waiting', 'resolved', 'all'];
const STATUS_LABELS: Record<SupportTicketFilter, string> = {
  open: 'Open',
  waiting: 'Waiting',
  resolved: 'Resolved',
  all: 'All',
};

export default function SupportInboxPage() {
  const { user } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = readFilter(searchParams.get('status'));
  const selectedTicketId = searchParams.get('ticketId');
  const tickets = useSupportTickets();
  const filteredTickets = useMemo(
    () => filterTickets(tickets.data ?? [], filter),
    [filter, tickets.data]
  );
  const selectedTicket =
    tickets.data?.find(ticket => ticket.id === selectedTicketId) ?? filteredTickets[0] ?? null;
  const statusMutation = useUpdateSupportTicketStatus(selectedTicket?.id ?? '');
  const counts = useMemo(() => countTickets(tickets.data ?? []), [tickets.data]);

  const selectFilter = (nextFilter: SupportTicketFilter) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (nextFilter === 'all') next.delete('status');
      else next.set('status', nextFilter);
      next.delete('ticketId');
      return next;
    });
  };

  const selectTicket = (ticketId: string) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('ticketId', ticketId);
      return next;
    });
  };

  const setStatus = (status: SupportTicketStatus) => {
    if (!selectedTicket || selectedTicket.status === status) return;
    statusMutation.mutate(status);
  };

  return (
    <PageShell maxWidth="max-w-8xl">
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Support', href: '/admin/support' },
        ]}
        title="Support Inbox"
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-semibold text-foreground">Support Inbox</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Prioritize show-day tickets, review diagnostics, and reply from one queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(status => (
            <Button
              key={status}
              type="button"
              variant={filter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => selectFilter(status)}
            >
              {STATUS_LABELS[status]} ({status === 'all' ? counts.all : counts[status]})
            </Button>
          ))}
        </div>
      </div>

      {tickets.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {tickets.error instanceof Error
              ? tickets.error.message
              : 'Could not load support tickets.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid min-h-[640px] grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Tickets</h3>
          </div>
          <div className="divide-y divide-border">
            {tickets.isLoading && (
              <div className="space-y-2 p-4 animate-pulse">
                <div className="h-16 rounded-md bg-muted" />
                <div className="h-16 rounded-md bg-muted" />
                <div className="h-16 rounded-md bg-muted" />
              </div>
            )}
            {!tickets.isLoading && filteredTickets.length === 0 && (
              <div className="p-8 text-center">
                <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  No {STATUS_LABELS[filter].toLowerCase()} tickets
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  New support requests will appear here.
                </p>
              </div>
            )}
            {filteredTickets.map(ticket => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => selectTicket(ticket.id)}
                className={`block w-full px-4 py-3 text-left transition-colors hover:bg-muted/70 ${
                  selectedTicket?.id === ticket.id ? 'bg-muted' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="line-clamp-1 text-sm font-semibold">{ticket.subject}</span>
                  {ticket.isShowDayPriority && (
                    <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                      Show day
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{formatShortDate(ticket.createdAt)}</span>
                  <span className="capitalize">{ticket.status}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-md border border-border bg-card p-5">
          {!selectedTicket && !tickets.isLoading && (
            <div className="flex h-full min-h-[360px] items-center justify-center text-center">
              <div>
                <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <h3 className="text-base font-semibold">No ticket selected</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a ticket to review diagnostics and reply.
                </p>
              </div>
            </div>
          )}

          {selectedTicket && user && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold">{selectedTicket.subject}</h3>
                    <StatusBadge status={selectedTicket.status} />
                    {selectedTicket.isShowDayPriority && (
                      <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                        Show-day priority
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Owner {selectedTicket.ownerId.slice(0, 8)} · Updated{' '}
                    {formatShortDate(selectedTicket.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['open', 'waiting', 'resolved'] as SupportTicketStatus[]).map(status => (
                    <Button
                      key={status}
                      type="button"
                      size="sm"
                      variant={selectedTicket.status === status ? 'default' : 'outline'}
                      disabled={statusMutation.isPending}
                      onClick={() => setStatus(status)}
                    >
                      {STATUS_LABELS[status]}
                    </Button>
                  ))}
                </div>
              </div>

              {statusMutation.error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {statusMutation.error instanceof Error
                      ? statusMutation.error.message
                      : 'Could not update ticket status.'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <SupportTicketThread
                  ticketId={selectedTicket.id}
                  currentUserId={user.id}
                  isOperator
                />
                <DiagnosticsPanel ticket={selectedTicket} />
              </div>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function readFilter(value: string | null): SupportTicketFilter {
  return value === 'open' || value === 'waiting' || value === 'resolved' ? value : 'open';
}

function filterTickets(tickets: SupportTicket[], filter: SupportTicketFilter): SupportTicket[] {
  return filter === 'all' ? tickets : tickets.filter(ticket => ticket.status === filter);
}

function countTickets(tickets: SupportTicket[]) {
  return {
    all: tickets.length,
    open: tickets.filter(ticket => ticket.status === 'open').length,
    waiting: tickets.filter(ticket => ticket.status === 'waiting').length,
    resolved: tickets.filter(ticket => ticket.status === 'resolved').length,
  };
}

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
      {status}
    </span>
  );
}

function DiagnosticsPanel({ ticket }: { ticket: SupportTicket }) {
  const diagnostics = ticket.diagnostics;
  const replication = diagnostics.connectivity.replication;

  return (
    <aside className="rounded-md border border-border bg-background p-4">
      <h4 className="text-sm font-semibold">Diagnostics</h4>
      <dl className="mt-3 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Online</dt>
          <dd className="font-medium">
            {diagnostics.connectivity.online === false ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                <WifiOff className="h-3.5 w-3.5" />
                Offline
              </span>
            ) : (
              String(diagnostics.connectivity.online ?? 'unknown')
            )}
          </dd>
        </div>
        <DiagnosticRow label="Route" value={diagnostics.route} />
        <DiagnosticRow label="Show" value={diagnostics.context.showId} />
        <DiagnosticRow label="Trial" value={diagnostics.context.trialId} />
        <DiagnosticRow label="Entry" value={diagnostics.context.entryId} />
        <DiagnosticRow label="Sync" value={replication.status} />
        <DiagnosticRow label="Queue" value={replication.queueSize} />
        <DiagnosticRow label="Conflicts" value={replication.conflictCount} />
        <DiagnosticRow label="Errors" value={replication.errorCount} />
      </dl>
      {diagnostics.clientErrors.length > 0 && (
        <div className="mt-4">
          <h5 className="text-xs font-semibold uppercase text-muted-foreground">Client errors</h5>
          <div className="mt-2 space-y-2">
            {diagnostics.clientErrors.map(error => (
              <div key={`${error.timestamp}-${error.message}`} className="rounded-md bg-muted p-2">
                <p className="text-xs font-medium">{error.message}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{error.source}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[180px] break-words text-right font-medium">
        {String(value ?? 'none')}
      </dd>
    </div>
  );
}
