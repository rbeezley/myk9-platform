/**
 * Utility functions for SecretaryDashboard
 */

import { Badge } from '@/components/ui/badge';

/**
 * Returns a styled badge component based on trial status
 */
export function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-success-green/10 text-success-green border-success-green/20">
          Completed
        </Badge>
      );
    case 'active':
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>
      );
    default:
      return (
        <Badge className="bg-muted text-muted-foreground border-border">Upcoming</Badge>
      );
  }
}
