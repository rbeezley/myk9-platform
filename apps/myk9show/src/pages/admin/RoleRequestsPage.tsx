import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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

const statusLabels: Record<RoleRequestStatus | 'all', string> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  cancelled: 'Cancelled',
};

const roleLabels: Record<RoleRequest['requestedRole'], string> = {
  club_admin: 'Club admin',
  secretary: 'Show secretary',
};

function StatusBadge({ status }: { status: RoleRequestStatus }) {
  const styles: Record<RoleRequestStatus, string> = {
    pending: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    approved: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
    denied: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    cancelled: 'border-muted bg-muted text-muted-foreground',
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RoleRequestsPage() {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<RoleRequestStatus | 'all'>('pending');
  const [selectedClubs, setSelectedClubs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const filteredRequests = useMemo(
    () => (filter === 'all' ? requests : requests.filter(request => request.status === filter)),
    [filter, requests]
  );

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const request of requests) result[request.status] = (result[request.status] ?? 0) + 1;
    return result;
  }, [requests]);

  const handleApprove = async (request: RoleRequest) => {
    const clubId = selectedClubs[request.id] || request.clubId;
    if (!clubId) {
      notifications.error('Choose a club before approving this request.');
      return;
    }

    try {
      setBusyId(request.id);
      await approveRoleRequest(request.id, {
        clubId,
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
      notifications.error('Failed to approve role request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeny = async (request: RoleRequest) => {
    try {
      setBusyId(request.id);
      await denyRoleRequest(request.id, notes[request.id]?.trim() || 'Denied by site admin.');
      notifications.success('Role request denied');
      await loadRequests();
    } catch (err) {
      logger.error('Failed to deny role request', 'admin', { requestId: request.id }, err as Error);
      notifications.error('Failed to deny role request.');
    } finally {
      setBusyId(null);
    }
  };

  const breadcrumbs = [
    { label: 'Admin', href: '/admin' },
    { label: 'Role Requests', href: '/admin/role-requests' },
  ];

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title="Role Requests"
        actions={
          <Button variant="outline" asChild>
            <Link to="/admin/users">Manage Users</Link>
          </Button>
        }
      />

      <div className="mb-6 mt-4">
        <h1 className="text-2xl font-semibold text-foreground">Role Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review new signup requests for elevated club access.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'pending', 'approved', 'denied', 'cancelled'] as const).map(status => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              filter === status
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {statusLabels[status]} ({status === 'all' ? requests.length : (counts[status] ?? 0)})
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-muted-foreground">Loading requests...</div>
      )}

      {!loading && filteredRequests.length === 0 && (
        <div className="rounded-md border border-border bg-card px-6 py-12 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            No {statusLabels[filter].toLowerCase()} requests
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            New elevated signup requests will appear here for site-admin review.
          </p>
        </div>
      )}

      {!loading && filteredRequests.length > 0 && (
        <div className="space-y-3">
          {filteredRequests.map(request => {
            const isPending = request.status === 'pending';
            const selectedClubId = selectedClubs[request.id] ?? request.clubId ?? '';

            return (
              <article key={request.id} className="rounded-md border border-border bg-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">
                        {request.requesterName}
                      </h2>
                      <StatusBadge status={request.status} />
                      <span className="text-sm text-muted-foreground">
                        {roleLabels[request.requestedRole]}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {request.requesterEmail ?? 'No email'} · Requested{' '}
                      {formatDate(request.createdAt)}
                    </div>
                    {request.requesterNote && (
                      <p className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                        {request.requesterNote}
                      </p>
                    )}
                  </div>
                  {request.status === 'approved' && (
                    <div className="inline-flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                      <CheckCircle2 className="h-4 w-4" />
                      Approved {request.reviewedAt ? formatDate(request.reviewedAt) : ''}
                    </div>
                  )}
                  {request.status === 'denied' && (
                    <div className="inline-flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                      <XCircle className="h-4 w-4" />
                      Denied {request.reviewedAt ? formatDate(request.reviewedAt) : ''}
                    </div>
                  )}
                  {request.status === 'pending' && (
                    <div className="inline-flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                      <Clock className="h-4 w-4" />
                      Needs review
                    </div>
                  )}
                </div>

                {isPending && (
                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto] md:items-end">
                    <label className="block text-sm font-medium">
                      Club
                      <select
                        value={selectedClubId}
                        onChange={event =>
                          setSelectedClubs(prev => ({
                            ...prev,
                            [request.id]: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Choose a club...</option>
                        {clubs.map(club => (
                          <option key={club.id} value={club.id}>
                            {club.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      Admin note
                      <input
                        type="text"
                        value={notes[request.id] ?? ''}
                        onChange={event =>
                          setNotes(prev => ({
                            ...prev,
                            [request.id]: event.target.value,
                          }))
                        }
                        placeholder="Optional note"
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => handleApprove(request)}
                        disabled={busyId === request.id || !selectedClubId}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleDeny(request)}
                        disabled={busyId === request.id}
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                )}

                {!isPending && request.reviewerNote && (
                  <p className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    {request.reviewerNote}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
