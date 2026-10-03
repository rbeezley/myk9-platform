/**
 * Onboarding role step — Club admin (MYK9-970).
 *
 * A quick check, not a form: it points at the pages that already own the club
 * profile (/clubs/:id, "Edit club" in its Actions menu) and the officers
 * (/club-admin/members, Officers tab). Nothing here edits club data.
 */

import { Building2 } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';
import { ScopeType, UserRole } from '@/types/auth-types';
import { RoleStepFooter, StepLink } from './RoleStepFooter';

interface StepClubAdminProps {
  onNext: () => void;
  onBack: () => void;
  onNavigateAway: (destination: string) => void;
  canGoBack: boolean;
  nextLabel: string;
}

export function StepClubAdmin({
  onNext,
  onBack,
  onNavigateAway,
  canGoBack,
  nextLabel,
}: StepClubAdminProps) {
  const { userWithRoles } = useAuthContext();
  const clubs = useClubStore(state => state.clubs);
  const clubIds = [
    ...new Set(
      (userWithRoles?.scopes ?? [])
        .filter(scope => scope.scopeType === ScopeType.CLUB && scope.roleId === UserRole.CLUB_ADMIN)
        .map(scope => scope.scopeId)
    ),
  ];

  return (
    <div className="space-y-4" data-testid="step-club-admin">
      <div>
        <h2 className="text-xl font-semibold">Check your club</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Exhibitors see your club&apos;s profile, and secretaries rely on its officers. Take a
          quick look that both are right.
        </p>
      </div>

      {clubIds.length > 0 && (
        <ul className="space-y-2" aria-label="Clubs you manage">
          {clubIds.map(clubId => (
            <li
              key={clubId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-3"
            >
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">
                {clubs.find(club => club.id === clubId)?.name ?? 'Your club'}
              </span>
              <StepLink to={`/clubs/${clubId}`} onNavigateAway={onNavigateAway}>
                Club profile
              </StepLink>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        Officers and members live on{' '}
        <StepLink to="/club-admin/members" onNavigateAway={onNavigateAway}>
          Members and officers
        </StepLink>
        . You can come back to both any time.
      </p>

      <RoleStepFooter onBack={onBack} onNext={onNext} canGoBack={canGoBack} nextLabel={nextLabel} />
    </div>
  );
}
