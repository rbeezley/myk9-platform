import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ADD_YOUR_CLUB_PATH,
  ADD_YOUR_CLUB_PROMPT,
} from '@/components/landing/lifecycle/landingCtas';

// One card: the access request first (the action), the read-only roles last
// (the current state). Kept together so the two never get split by the
// profile cards (MYK9-1237).
export function AccountAccessRolesCard({ roleBadges }: { roleBadges: string[] }) {
  return (
    <Card data-testid="account-access-roles-card">
      <CardHeader>
        <CardTitle className="text-base">Additional Access Request</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ask a club already on myK9Show to add you as a member or its show secretary.
          </p>
          <Button asChild variant="outline" size="touch">
            <Link to="/request-access">Request additional access</Link>
          </Button>
          <p className="text-sm">
            <Link
              to={ADD_YOUR_CLUB_PATH}
              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
            >
              {ADD_YOUR_CLUB_PROMPT}
            </Link>
          </p>
        </div>
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-medium">Your roles</h3>
          <p className="text-sm text-muted-foreground">
            These roles determine which parts of myK9Show are available to you.
          </p>
          {roleBadges.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label="Assigned roles">
              {roleBadges.map((label, index) => (
                // Two distinct clubs can share a display name, so the same
                // label text can legitimately appear twice — index keeps the
                // key unique without changing the label itself.
                <Badge key={`${label}-${index}`} variant="secondary">
                  {label}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No roles assigned.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Roles are managed by your organization administrator.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
