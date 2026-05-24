import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMyAccessRequests } from './useAccessRequests';
import type { ClubAccessRequest } from './accessRequestTypes';

const STATUS_LABELS: Record<ClubAccessRequest['status'], string> = {
  pending: 'Club access request pending',
  approved: 'Club access approved',
  denied: 'Club access request denied',
};

export function AccessRequestStatusCard() {
  const { data: requests = [], isLoading } = useMyAccessRequests();

  if (isLoading || requests.length === 0) {
    return null;
  }

  const latestRequest = requests[0];
  if (!latestRequest) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {STATUS_LABELS[latestRequest.status]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-medium">{latestRequest.requested_club_name}</p>
        {latestRequest.review_note && (
          <p className="text-muted-foreground">{latestRequest.review_note}</p>
        )}
      </CardContent>
    </Card>
  );
}
