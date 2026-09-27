import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { PageShell } from '@/components/common/PageShell';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  type ListView,
} from '@/components/list-toolkit';
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

type StatusFilter = RoleRequestStatus | 'all';

const DEFAULT_STATUS_FILTER: StatusFilter = 'pending';

function readStatusFilter(value: string | null): StatusFilter {
  return (ROLE_REQUEST_STATUS_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as StatusFilter)
    : DEFAULT_STATUS_FILTER;
}

const REQUEST_NOUN = ['request', 'requests'] as const;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = readStatusFilter(searchParams.get('status'));
  const searchTerm = searchParams.get('q') ?? '';
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const views: ListView[] = useMemo(
    () =>
      ROLE_REQUEST_STATUS_FILTERS.map(status => ({
        id: status,
        label: getRoleRequestFilterLabel(status),
        count: status === 'all' ? requests.length : (counts[status] ?? 0),
      })),
    [counts, requests.length]
  );

  const setFilter = useCallback(
    (next: StatusFilter) => {
      setSearchParams(current => {
        const nextParams = new URLSearchParams(current);
        if (next === DEFAULT_STATUS_FILTER) nextParams.delete('status');
        else nextParams.set('status', next);
        return nextParams;
      });
    },
    [setSearchParams]
  );

  const setSearchTerm = useCallback(
    (value: string) => {
      setSearchParams(current => {
        const nextParams = new URLSearchParams(current);
        if (value) nextParams.set('q', value);
        else nextParams.delete('q');
        return nextParams;
      });
    },
    [setSearchParams]
  );

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

      <ListViewTabs
        label="Filter role requests"
        views={views}
        activeId={filter}
        onSelect={id => setFilter(id as StatusFilter)}
      />

      <ListFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name, email, club, or role"
        fields={[]}
      />

      <ListResultLine
        shown={filteredRequests.length}
        total={requests.length}
        noun={REQUEST_NOUN}
        filtered={hasSearch || filter !== DEFAULT_STATUS_FILTER}
      />

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
