import React, { useState } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { notifications } from '@/lib/notifications';
import {
  useApproveAccessRequest,
  useDenyAccessRequest,
  usePendingAccessRequests,
} from '@/features/access-requests/useAccessRequests';
import type { ClubAccessRequest } from '@/features/access-requests/accessRequestTypes';

function requesterName(request: ClubAccessRequest) {
  const first = request.requester?.first_name ?? '';
  const last = request.requester?.last_name ?? '';
  return `${first} ${last}`.trim() || request.requester?.email || 'Unknown requester';
}

const AccessRequestsPage: React.FC = () => {
  const { data: requests = [], isLoading, error, refetch } = usePendingAccessRequests();
  const approve = useApproveAccessRequest();
  const deny = useDenyAccessRequest();
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [clubNames, setClubNames] = useState<Record<string, string>>({});
  const [existingClubIds, setExistingClubIds] = useState<Record<string, string>>({});

  async function handleApprove(request: ClubAccessRequest) {
    const clubName = (clubNames[request.id] ?? request.requested_club_name).trim();
    if (clubName.length < 2) {
      notifications.error('Enter a club name before approving.');
      return;
    }

    try {
      await approve.mutateAsync({
        requestId: request.id,
        existingClubId: existingClubIds[request.id]?.trim() || null,
        clubName,
        reviewNote: reviewNotes[request.id] ?? null,
      });
      notifications.success('Club access approved');
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Could not approve request');
    }
  }

  async function handleDeny(request: ClubAccessRequest) {
    try {
      await deny.mutateAsync({
        requestId: request.id,
        reviewNote: reviewNotes[request.id] ?? null,
      });
      notifications.success('Club access denied');
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Could not deny request');
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Access Requests', href: '/admin/access-requests' },
        ]}
        title="Access Requests"
      />

      {error && (
        <ErrorState message="Failed to load access requests." onRetry={() => void refetch()} />
      )}

      {!error && isLoading && (
        <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
          Loading access requests...
        </div>
      )}

      {!error && !isLoading && requests.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="No pending access requests"
          description="New club admin requests will appear here for approval."
        />
      )}

      <div className="space-y-4">
        {requests.map(request => (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle className="text-lg">{request.requested_club_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Requested by {requesterName(request)}
                {request.requester?.email ? ` (${request.requester.email})` : ''}
              </div>
              {request.requested_club_website && (
                <a
                  href={request.requested_club_website}
                  className="text-sm text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {request.requested_club_website}
                </a>
              )}
              {request.request_note && <p className="text-sm">{request.request_note}</p>}
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium" htmlFor={`club-${request.id}`}>
                    Club name to create
                  </label>
                  <Input
                    id={`club-${request.id}`}
                    value={clubNames[request.id] ?? request.requested_club_name}
                    onChange={event =>
                      setClubNames(prev => ({ ...prev, [request.id]: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor={`existing-club-${request.id}`}>
                    Existing club ID
                  </label>
                  <Input
                    id={`existing-club-${request.id}`}
                    className="font-mono text-sm"
                    value={existingClubIds[request.id] ?? ''}
                    onChange={event =>
                      setExistingClubIds(prev => ({ ...prev, [request.id]: event.target.value }))
                    }
                    placeholder="Leave blank to create a new club"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional UUID. Use only when the club already exists and this requester should
                    become its club admin.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor={`note-${request.id}`}>
                    Review note
                  </label>
                  <Textarea
                    id={`note-${request.id}`}
                    value={reviewNotes[request.id] ?? ''}
                    onChange={event =>
                      setReviewNotes(prev => ({ ...prev, [request.id]: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void handleApprove(request)} disabled={approve.isPending}>
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleDeny(request)}
                  disabled={deny.isPending}
                >
                  <X className="h-4 w-4 mr-2" />
                  Deny
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
};

export default AccessRequestsPage;
