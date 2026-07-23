import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, Mail, Phone, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { PageShell } from '@/components/common/PageShell';
import { formatShortDate } from '@/lib/format/dates';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import {
  getAllOnboardingRequests,
  updateOnboardingRequest,
  type OnboardingRequest,
} from '@/services/database/onboarding-requests';
import {
  getOnboardingFilterLabel,
  getOnboardingStatusPresentation,
  ONBOARDING_STATUS_FILTERS,
} from './adminStatusPresentation';

type OnboardingStatus = OnboardingRequest['status'];

// The editable statuses are the filter tabs minus the 'all' pseudo-filter —
// derive them so the two lists can't drift when a status is added.
const STATUS_OPTIONS: readonly OnboardingStatus[] = ONBOARDING_STATUS_FILTERS.filter(
  (status): status is OnboardingStatus => status !== 'all'
);

function StatusBadge({ status }: { status: OnboardingStatus }) {
  const presentation = getOnboardingStatusPresentation(status);
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${presentation.className}`}
    >
      {presentation.label}
    </span>
  );
}

export default function OnboardingInboxPage() {
  const [requests, setRequests] = useState<OnboardingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<OnboardingStatus | 'all'>('pending');
  // Per-row edit drafts. Absent key = "unchanged from persisted value".
  const [statusDrafts, setStatusDrafts] = useState<Record<string, OnboardingStatus>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setRequests(await getAllOnboardingRequests());
      // Drop drafts on reload — persisted values are now authoritative.
      setStatusDrafts({});
      setNoteDrafts({});
    } catch (err) {
      setError('Failed to load onboarding requests.');
      logger.error('Failed to load onboarding requests', 'admin', {}, err as Error);
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

  const handleSave = async (request: OnboardingRequest) => {
    const nextStatus = statusDrafts[request.id] ?? request.status;
    const nextNote = noteDrafts[request.id] ?? request.notes ?? '';
    const statusChanged = nextStatus !== request.status;
    const noteChanged = nextNote.trim() !== (request.notes ?? '').trim();

    if (!statusChanged && !noteChanged) return;

    try {
      setBusyId(request.id);
      await updateOnboardingRequest(request.id, {
        ...(statusChanged ? { status: nextStatus } : {}),
        ...(noteChanged ? { notes: nextNote.trim() } : {}),
      });
      notifications.success('Onboarding request updated');
      await loadRequests();
    } catch (err) {
      logger.error(
        'Failed to update onboarding request',
        'admin',
        { requestId: request.id },
        err as Error
      );
      notifications.error('Failed to update onboarding request.');
    } finally {
      setBusyId(null);
    }
  };

  const breadcrumbs = [
    { label: 'Admin', href: '/admin' },
    { label: 'Onboarding', href: '/admin/onboarding' },
  ];

  return (
    <PageShell>
      <PageHeader breadcrumbs={breadcrumbs} title="Club Onboarding" />

      <div className="mb-6 mt-4">
        <h2 className="text-2xl font-semibold text-foreground">Club Onboarding</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Work the intake queue for clubs requesting to run shows on the platform.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {ONBOARDING_STATUS_FILTERS.map(status => (
          <button
            key={status}
            type="button"
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              filter === status
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {`${getOnboardingFilterLabel(status)} (${
              status === 'all' ? requests.length : (counts[status] ?? 0)
            })`}
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
          <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            No {getOnboardingFilterLabel(filter).toLowerCase()} requests
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Club onboarding requests submitted from the homepage will appear here.
          </p>
        </div>
      )}

      {!loading && filteredRequests.length > 0 && (
        <div className="space-y-3">
          {filteredRequests.map(request => {
            const draftStatus = statusDrafts[request.id] ?? request.status;
            const draftNote = noteDrafts[request.id] ?? request.notes ?? '';
            const dirty =
              draftStatus !== request.status || draftNote.trim() !== (request.notes ?? '').trim();

            return (
              <article key={request.id} className="rounded-md border border-border bg-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {request.clubName}
                      </h3>
                      <StatusBadge status={request.status} />
                      <span className="text-sm text-muted-foreground">{request.organization}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {request.contactName} · Requested {formatShortDate(request.createdAt)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <a
                        href={`mailto:${request.contactEmail}`}
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {request.contactEmail}
                      </a>
                      {request.contactPhone && (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          {request.contactPhone}
                        </span>
                      )}
                      {request.firstShowDate && (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" />
                          First show {formatShortDate(request.firstShowDate)}
                        </span>
                      )}
                    </div>
                    {request.message && (
                      <p className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                        {request.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(160px,auto)_minmax(220px,1fr)_auto] md:items-end">
                  <label className="block text-sm font-medium">
                    Status
                    <select
                      value={draftStatus}
                      onChange={event =>
                        setStatusDrafts(prev => ({
                          ...prev,
                          [request.id]: event.target.value as OnboardingStatus,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary/15"
                    >
                      {STATUS_OPTIONS.map(option => (
                        <option key={option} value={option}>
                          {getOnboardingFilterLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Internal note
                    <input
                      type="text"
                      value={draftNote}
                      onChange={event =>
                        setNoteDrafts(prev => ({
                          ...prev,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Not shown to the club"
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary/15"
                    />
                  </label>
                  <Button
                    type="button"
                    onClick={() => handleSave(request)}
                    disabled={busyId === request.id || !dirty}
                  >
                    {busyId === request.id ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
