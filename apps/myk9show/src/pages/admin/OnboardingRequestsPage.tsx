import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import {
  getAllOnboardingRequests,
  updateOnboardingRequest,
  type OnboardingRequest,
} from '@/services/database/queries/onboardingRequestQueries';
import { logger } from '@/services/LoggingService';

const STATUS_OPTIONS: OnboardingRequest['status'][] = [
  'pending',
  'contacted',
  'onboarded',
  'declined',
];

const statusConfig: Record<
  OnboardingRequest['status'],
  { label: string; color: string; icon: typeof Clock }
> = {
  pending: {
    label: 'Pending',
    color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    icon: Clock,
  },
  contacted: {
    label: 'Contacted',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    icon: MessageSquare,
  },
  onboarded: {
    label: 'Onboarded',
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
    icon: CheckCircle2,
  },
  declined: {
    label: 'Declined',
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
    icon: XCircle,
  },
};

function NotesInput({
  requestId,
  initialValue,
  onSave,
}: {
  requestId: string;
  initialValue: string;
  onSave: (requestId: string, updates: { notes: string }) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <input
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onSave(requestId, { notes: value })}
      placeholder="Add notes..."
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
    />
  );
}

function StatusBadge({ status }: { status: OnboardingRequest['status'] }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export default function OnboardingRequestsPage() {
  const [requests, setRequests] = useState<OnboardingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OnboardingRequest['status'] | 'all'>('all');

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllOnboardingRequests();
      setRequests(data);
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

  const handleUpdate = useCallback(
    async (
      requestId: string,
      updates: { status?: OnboardingRequest['status']; notes?: string }
    ) => {
      try {
        await updateOnboardingRequest(requestId, updates);
        setRequests(prev => prev.map(r => (r.id === requestId ? { ...r, ...updates } : r)));
      } catch (err) {
        logger.error('Failed to update onboarding request', 'admin', { requestId }, err as Error);
      }
    },
    []
  );

  const filteredRequests = useMemo(
    () => (filter === 'all' ? requests : requests.filter(r => r.status === filter)),
    [requests, filter]
  );

  const countsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of requests) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [requests]);

  const pendingCount = countsByStatus['pending'] ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-8 pt-8 pb-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Onboarding Requests</h1>
            <p className="text-sm text-muted-foreground">
              {pendingCount > 0
                ? `${pendingCount} pending request${pendingCount > 1 ? 's' : ''}`
                : 'No pending requests'}
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['all', ...STATUS_OPTIONS] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {s === 'all'
                ? `All (${requests.length})`
                : `${statusConfig[s].label} (${countsByStatus[s] ?? 0})`}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-muted-foreground">Loading requests...</div>
        )}

        {/* Empty */}
        {!loading && filteredRequests.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {filter === 'all' ? 'No onboarding requests yet.' : `No ${filter} requests.`}
          </div>
        )}

        {/* Request list */}
        {!loading && filteredRequests.length > 0 && (
          <div className="space-y-3">
            {filteredRequests.map(request => {
              const isExpanded = expandedId === request.id;
              const createdAt = new Date(request.createdAt);
              const createdDate = createdAt.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const createdTime = createdAt.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              });

              return (
                <div
                  key={request.id}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : request.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold text-foreground">{request.clubName}</span>
                        <StatusBadge status={request.status} />
                        <span className="text-xs text-muted-foreground">
                          {request.organization}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {request.contactName} · {request.contactEmail} · {createdDate} at{' '}
                        {createdTime}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                      {/* Details grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Contact Phone:</span>{' '}
                          <span className="text-foreground">
                            {request.contactPhone || 'Not provided'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">First Show Date:</span>{' '}
                          <span className="text-foreground">
                            {request.firstShowDate
                              ? new Date(request.firstShowDate + 'T00:00:00').toLocaleDateString(
                                  'en-US',
                                  { month: 'long', day: 'numeric', year: 'numeric' }
                                )
                              : 'Not specified'}
                          </span>
                        </div>
                      </div>

                      {/* Message */}
                      {request.message && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Message:</span>
                          <p className="text-foreground mt-1 bg-background rounded-lg px-3 py-2 border border-border">
                            {request.message}
                          </p>
                        </div>
                      )}

                      {/* Status change + Notes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1.5">
                            Status
                          </label>
                          <select
                            value={request.status}
                            onChange={e =>
                              handleUpdate(request.id, {
                                status: e.target.value as OnboardingRequest['status'],
                              })
                            }
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>
                                {statusConfig[s].label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1.5">
                            Internal Notes
                          </label>
                          <NotesInput
                            requestId={request.id}
                            initialValue={request.notes ?? ''}
                            onSave={handleUpdate}
                          />
                        </div>
                      </div>

                      {/* Onboard action */}
                      {request.status !== 'onboarded' && (
                        <div className="flex justify-end">
                          <a
                            href={`/clubs?action=create&onboardingRequestId=${request.id}&clubName=${encodeURIComponent(request.clubName)}&organization=${encodeURIComponent(request.organization)}`}
                            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Onboard This Club
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
