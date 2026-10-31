import { Link } from 'react-router-dom';
import { Dog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useRingsideGrantRole } from './useRingsideGrantRole';
import { isStaffRingsideRole } from './useStaffDogGate';

const STAFF_ACCOUNT_ROLES = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.JUDGE,
  UserRole.STEWARD,
  UserRole.EXHIBITOR,
];

/**
 * Door from the class picker to the show-wide dog finder: staff (MYK9-1509) and
 * exhibitors (MYK9-1517, a limited server-side view). Reads
 * the show's passcode grant first, then the account roles, the order
 * `resolveRingsideAccess` uses; the destination re-checks with the full hook.
 */
export function AtShowDogsLink({ showId }: { showId: string | undefined }) {
  const { hasRole } = useAuthContext();
  const grantRole = useRingsideGrantRole(showId);
  const isStaff = grantRole
    ? isStaffRingsideRole(grantRole) || grantRole === 'exhibitor'
    : STAFF_ACCOUNT_ROLES.some(role => hasRole(role));
  if (!isStaff || !showId) return null;
  return (
    <div className="mb-4 flex justify-center">
      <Button asChild variant="outline" className="min-h-11 gap-2 px-4">
        <Link to={`/at-show/${showId}/dogs`}>
          <Dog className="h-4 w-4" aria-hidden />
          Find a dog
        </Link>
      </Button>
    </div>
  );
}
