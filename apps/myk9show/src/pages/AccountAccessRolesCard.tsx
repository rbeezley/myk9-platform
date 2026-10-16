import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
            Set up a new club or ask an existing club to appoint you as its show secretary.
          </p>
          <Button asChild variant="outline" size="touch">
            <Link to="/request-access">Request additional access</Link>
          </Button>
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
