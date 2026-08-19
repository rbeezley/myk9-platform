import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { PageShell } from '@/components/common/PageShell';
import { useClubsQuery } from '@/hooks/queries/useClubsDatabase';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import {
  approveRoleRequest,
  denyRoleRequest,
  getAllRoleRequests,
  type RoleRequest,
  type RoleRequestStatus,
} from '@/services/database/role-requests';
import { getRoleRequestFilterLabel, ROLE_REQUEST_STATUS_FILTERS } from './adminStatusPresentation';
import { RoleRequestCard, type ActionError } from './RoleRequestCard';
import { getRoleLabel } from './roleRequestPresentation';

function getEmptyStateCopy(filter: RoleRequestStatus | 'all') {
  switch (filter) {
    case 'pending':
      return {
        title: 'No requests waiting for review',
        description: 'New elevated access requests will appear here when someone signs up.',
      };
    case 'approved':
      return {
        title: 'No approved requests yet',
        description: 'Approved requests will stay here so you can review the access history.',
      };
    case 'denied':
      return {
        title: 'No denied requests yet',
        description: 'Denied requests will stay here with the note from the review.',
      };
    default:
      return {
        title: 'No role requests yet',
        description: 'Elevated access requests will appear here for site admin review.',
      };
  }
}

function LoadingState() {
  return (
    <div aria-label="Loading role requests" className="space-y-4" role="status">
      <span className="sr-only">Loading role requests...</span>
      {[1, 2].map(item => (
        <div key={item} className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72 max-w-[70vw]" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RoleRequestsPage() {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<RoleRequestStatus | 'all'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClubs, setSelectedClubs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, ActionError>>({});
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'deny' | null>(null);
  const { data: clubs = [] } = useClubsQuery();

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setRequests(await getAllRoleRequests());
    } catch (err) {
      setError('Failed to load role requests.');
      logger.error('Failed to load role requests', 'admin', {}, err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredRequests = useMemo(() => {
    const statusRequests =
      filter === 'all' ? requests : requests.filter(request => request.status === filter);

    if (!normalizedSearchTerm) return statusRequests;

    return statusRequests.filter(request =>
      [
        request.requesterName,
        request.requesterEmail,
        request.clubName,
        request.requesterNote,
        getRoleLabel(request.requestedRole),
      ]
        .filter(Boolean)
        .some(value => value?.toLowerCase().includes(normalizedSearchTerm))
    );
  }, [filter, normalizedSearchTerm, requests]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const request of requests) result[request.status] = (result[request.status] ?? 0) + 1;
    return result;
  }, [requests]);

  const pendingCount = counts.pending ?? 0;

  const clearActionError = (requestId: string) => {
    setActionErrors(previous => {
      if (!previous[requestId]) return previous;
      const next = { ...previous };
      delete next[requestId];
      return next;
    });
  };

  const markRequestReviewed = (
    requestId: string,
    status: Extract<RoleRequestStatus, 'approved' | 'denied'>,
    updates: Pick<RoleRequest, 'clubId' | 'clubName' | 'reviewerNote'>
  ) => {
    const reviewedAt = new Date().toISOString();
    setRequests(previous =>
      previous.map(request =>
        request.id === requestId
          ? { ...request, ...updates, status, reviewedAt, updatedAt: reviewedAt }
          : request
      )
    );
  };

  const handleApprove = async (request: RoleRequest) => {
    clearActionError(request.id);
    const clubId = selectedClubs[request.id] || request.clubId;
    if (!clubId) {
      setActionErrors(previous => ({
        ...previous,
        [request.id]: {
          action: 'approve',
          message: 'Choose a club before approving this request.',
        },
      }));
      notifications.error('Choose a club before approving this request.');
      return;
    }

    try {
      setBusyId(request.id);
      setBusyAction('approve');
      await approveRoleRequest(request.id, {
        clubId,
        reviewerNote: notes[request.id]?.trim() || null,
      });
      markRequestReviewed(request.id, 'approved', {
        clubId,
        clubName: clubs.find(club => club.id === clubId)?.name ?? request.clubName,
        reviewerNote: notes[request.id]?.trim() || null,
      });
      notifications.success('Role request approved');
      await loadRequests();
    } catch (err) {
      logger.error(
        'Failed to approve role request',
        'admin',
        { requestId: request.id },
        err as Error
      );
      setActionErrors(previous => ({
        ...previous,
        [request.id]: {
          action: 'approve',
          message: "We couldn't approve this request. Try again.",
        },
      }));
      notifications.error('Failed to approve role request.');
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleDeny = async (request: RoleRequest) => {
    clearActionError(request.id);
    try {
      setBusyId(request.id);
      setBusyAction('deny');
      const reviewerNote = notes[request.id]?.trim() || 'Denied by site admin.';
      await denyRoleRequest(request.id, reviewerNote);
      markRequestReviewed(request.id, 'denied', {
        clubId: request.clubId,
        clubName: request.clubName,
        reviewerNote,
      });
      notifications.success('Role request denied');
      await loadRequests();
    } catch (err) {
      logger.error('Failed to deny role request', 'admin', { requestId: request.id }, err as Error);
      setActionErrors(previous => ({
        ...previous,
        [request.id]: {
          action: 'deny',
          message: "We couldn't deny this request. Try again.",
        },
      }));
      notifications.error('Failed to deny role request.');
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const breadcrumbs = [
    { label: 'Admin', href: '/admin' },
    { label: 'Role Requests', href: '/admin/role-requests' },
  ];
  const hasSearch = normalizedSearchTerm.length > 0;
  const emptyStateCopy = hasSearch
    ? {
        title: 'No matching requests',
        description: 'Try a different name, email address, club, or role.',
      }
    : getEmptyStateCopy(filter);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title="Role Requests"
        showTitle
        actions={
          <Button variant="outline" asChild>
            <Link to="/admin/users">Manage Users</Link>
          </Button>
        }
      />

      <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-base text-muted-foreground">
          Review new signup requests for elevated club access.
        </p>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 gap-2"
          onClick={loadRequests}
          disabled={loading}
          aria-busy={loading}
        >
          <RefreshCw
            className={`h-4 w-4 motion-reduce:animate-none ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Review queue</p>
          {loading && <Skeleton className="mt-1 h-4 w-44" />}
          {!loading && error && (
            <p className="text-sm text-muted-foreground">We couldn&apos;t refresh this queue.</p>
          )}
          {!loading && !error && (
            <p className="text-sm text-muted-foreground">
              {pendingCount > 0
                ? `${pendingCount} ${pendingCount === 1 ? 'request' : 'requests'} waiting for review`
                : 'Nothing is waiting for review'}
            </p>
          )}
        </div>
        {loading && <Skeleton className="h-7 w-24 rounded-full" />}
        {!loading && error && (
          <span className="rounded-full bg-background px-3 py-1 text-sm font-medium text-muted-foreground">
            Unavailable
          </span>
        )}
        {!loading && !error && (
          <span className="rounded-full bg-background px-3 py-1 text-sm font-medium text-foreground">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filter role requests" role="group">
        {ROLE_REQUEST_STATUS_FILTERS.map(status => (
          <button
            key={status}
            type="button"
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
            className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              filter === status
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {`${getRoleRequestFilterLabel(status)} (${
              status === 'all' ? requests.length : (counts[status] ?? 0)
            })`}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor="role-request-search" className="sr-only">
            Search role requests
          </label>
          <input
            id="role-request-search"
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Search by name, email, club, or role"
            className="min-h-11 w-full rounded-lg border border-input bg-background py-2 pl-11 pr-11 text-base focus-visible:border-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          {searchTerm && (
            <button
              type="button"
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Clear search"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {hasSearch
            ? `${filteredRequests.length} matching ${filteredRequests.length === 1 ? 'request' : 'requests'}`
            : `${filteredRequests.length} shown`}
        </p>
      </div>

      {error && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <span>{error}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={loadRequests}>
            Try again
          </Button>
        </div>
      )}

      {loading && <LoadingState />}

      {!loading && filteredRequests.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{emptyStateCopy.title}</h2>
          <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
            {emptyStateCopy.description}
          </p>
          {hasSearch && (
            <Button
              type="button"
              variant="outline"
              className="mt-5 min-h-11"
              onClick={() => setSearchTerm('')}
            >
              Clear search
            </Button>
          )}
        </div>
      )}

      {!loading && filteredRequests.length > 0 && (
        <div className="space-y-4">
          {filteredRequests.map(request => (
            <RoleRequestCard
              key={request.id}
              request={request}
              clubs={clubs}
              selectedClubId={selectedClubs[request.id] ?? request.clubId ?? ''}
              note={notes[request.id] ?? ''}
              busyId={busyId}
              busyAction={busyAction}
              actionError={actionErrors[request.id]}
              detailsOpen={expandedRequestId === request.id}
              onClubChange={clubId =>
                setSelectedClubs(previous => ({ ...previous, [request.id]: clubId }))
              }
              onNoteChange={note => setNotes(previous => ({ ...previous, [request.id]: note }))}
              onApprove={handleApprove}
              onDeny={handleDeny}
              onRetry={(retryRequest, action) =>
                action === 'approve' ? handleApprove(retryRequest) : handleDeny(retryRequest)
              }
              onToggleDetails={() =>
                setExpandedRequestId(current => (current === request.id ? null : request.id))
              }
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
