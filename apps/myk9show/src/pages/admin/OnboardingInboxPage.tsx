import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Inbox,
  Mail,
  MessageSquareText,
  Phone,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { PageShell } from '@/components/common/PageShell';
import { formatShortCalendarDate, formatShortDate } from '@/lib/format/dates';
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<OnboardingStatus | 'all'>('pending');
  // Per-row edit drafts. Absent key = "unchanged from persisted value".
  const [statusDrafts, setStatusDrafts] = useState<Record<string, OnboardingStatus>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      setRequests(await getAllOnboardingRequests());
    } catch (err) {
      setLoadFailed(true);
      logger.error('Failed to load onboarding requests', 'admin', {}, err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    const matching =
      filter === 'all' ? [...requests] : requests.filter(request => request.status === filter);

    // Pending is a work queue: the club waiting longest deserves attention first.
    if (filter === 'pending') {
      matching.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    }

    return matching;
  }, [filter, requests]);

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
      setSaveErrors(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      const updatedRequest = await updateOnboardingRequest(request.id, {
        ...(statusChanged ? { status: nextStatus } : {}),
        ...(noteChanged ? { notes: nextNote.trim() } : {}),
      });
      notifications.success('Onboarding request updated');
      setRequests(prev => prev.map(item => (item.id === request.id ? updatedRequest : item)));
      // Drop only this row's drafts while leaving unsaved edits in other rows intact.
      setStatusDrafts(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
      setNoteDrafts(prev => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
    } catch (err) {
      logger.error(
        'Failed to update onboarding request',
        'admin',
        { requestId: request.id },
        err as Error
      );
      setSaveErrors(prev => ({
        ...prev,
        [request.id]: "We couldn't save these changes. Your edits are still here. Try again.",
      }));
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
      <div className="space-y-2">
        <PageHeader breadcrumbs={breadcrumbs} title="Club Onboarding" showTitle />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-3xl text-base text-muted-foreground">
            Review new club requests, follow up with organizers, and track each club through setup.
            Mark a request onboarded after its club record and club admin access are ready.
          </p>
          <div className="shrink-0">
            <Button variant="outline" size="touch" asChild>
              <Link to="/clubs">
                <Building2 aria-hidden="true" />
                Manage clubs
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <label className="block sm:hidden">
        <span className="mb-1.5 block text-sm font-medium">Request status</span>
        <select
          value={filter}
          onChange={event => setFilter(event.target.value as OnboardingStatus | 'all')}
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {ONBOARDING_STATUS_FILTERS.map(status => (
            <option key={status} value={status}>
              {`${getOnboardingFilterLabel(status)} (${
                status === 'all' ? requests.length : (counts[status] ?? 0)
              })`}
            </option>
          ))}
        </select>
      </label>

      <div
        className="hidden flex-wrap gap-2 sm:flex"
        role="group"
        aria-label="Filter club onboarding requests"
      >
        {ONBOARDING_STATUS_FILTERS.map(status => (
          <Button
            key={status}
            type="button"
            size="touch"
            variant={filter === status ? 'default' : 'secondary'}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {`${getOnboardingFilterLabel(status)} (${
              status === 'all' ? requests.length : (counts[status] ?? 0)
            })`}
          </Button>
        ))}
      </div>

      {loadFailed && (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/10 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-foreground">We couldn't load club requests</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Try again. If the problem continues, check System Health.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="touch" onClick={loadRequests}>
            Try again
          </Button>
        </div>
      )}

      {loading && (
        <div role="status" aria-live="polite" aria-label="Loading club requests">
          <span className="sr-only">Loading club requests</span>
          <div className="space-y-3" aria-hidden="true">
            {[0, 1].map(index => (
              <div
                key={index}
                className="animate-pulse rounded-lg border border-border bg-card p-5"
              >
                <div className="h-5 w-48 rounded bg-muted" />
                <div className="mt-3 h-4 w-72 max-w-full rounded bg-muted" />
                <div className="mt-5 grid gap-3 md:grid-cols-[10rem_1fr_8rem]">
                  <div className="h-11 rounded bg-muted" />
                  <div className="h-11 rounded bg-muted" />
                  <div className="h-11 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !loadFailed && filteredRequests.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
          <Inbox className="mx-auto mb-3 h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">
            {requests.length === 0
              ? "You're caught up"
              : `No ${getOnboardingFilterLabel(filter).toLowerCase()} requests`}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-base text-muted-foreground">
            {requests.length === 0
              ? 'New requests will appear here after a club organizer submits the onboarding form.'
              : `There ${requests.length === 1 ? 'is' : 'are'} ${requests.length} ${
                  requests.length === 1 ? 'request' : 'requests'
                } in other statuses.`}
          </p>
          {requests.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="mt-5"
              onClick={() => setFilter('all')}
            >
              View all {requests.length} {requests.length === 1 ? 'request' : 'requests'}
            </Button>
          )}
        </div>
      )}

      {!loading && !loadFailed && filteredRequests.length > 0 && (
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
                    <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
                      <a
                        href={`mailto:${request.contactEmail}`}
                        className="inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <Mail className="h-4 w-4" aria-hidden="true" />
                        {request.contactEmail}
                      </a>
                      {request.contactPhone && (
                        <a
                          href={`tel:${request.contactPhone.replace(/\s+/g, '')}`}
                          className="inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <Phone className="h-4 w-4" aria-hidden="true" />
                          {request.contactPhone}
                        </a>
                      )}
                      {request.firstShowDate && (
                        <span className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground">
                          <CalendarClock className="h-4 w-4" aria-hidden="true" />
                          First show {formatShortCalendarDate(request.firstShowDate)}
                        </span>
                      )}
                    </div>
                    {request.message && (
                      <div className="mt-3 flex max-w-3xl gap-2 text-sm leading-relaxed text-foreground">
                        <MessageSquareText
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <p>{request.message}</p>
                      </div>
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
                      className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                      className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </label>
                  <Button
                    type="button"
                    size="touch"
                    className="w-full md:w-auto"
                    onClick={() => handleSave(request)}
                    disabled={busyId === request.id || !dirty}
                    loading={busyId === request.id}
                  >
                    Save changes
                  </Button>
                </div>
                {saveErrors[request.id] && (
                  <p className="mt-3 text-sm text-destructive" role="alert">
                    {saveErrors[request.id]}
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
