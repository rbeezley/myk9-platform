/**
 * Onboarding role step — Secretary (MYK9-970).
 *
 * INTENT: read-only. Secretary access comes ONLY from a club admin's
 * appointment (grant_club_secretary). This step shows the appointments that
 * exist and never offers a club picker, a request form or any other way to
 * grant access; with no appointment it links to the existing Request
 * additional access page.
 */

import { Building2 } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';
import { getSecretaryAppointments } from '../secretaryAppointments';
import { RoleStepFooter, StepLink } from './RoleStepFooter';

interface StepSecretaryProps {
  onNext: () => void;
  onBack: () => void;
  onNavigateAway: (destination: string) => void;
  canGoBack: boolean;
  nextLabel: string;
}

export function StepSecretary({
  onNext,
  onBack,
  onNavigateAway,
  canGoBack,
  nextLabel,
}: StepSecretaryProps) {
  const { userWithRoles } = useAuthContext();
  const clubs = useClubStore(state => state.clubs);
  const { clubIds, showCount } = getSecretaryAppointments(userWithRoles?.scopes ?? []);
  const hasAppointment = clubIds.length > 0 || showCount > 0;

  return (
    <div className="space-y-4" data-testid="step-secretary">
      <div>
        <h2 className="text-xl font-semibold">Your secretary access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A club admin appoints each secretary. Here is where you can work.
        </p>
      </div>

      {clubIds.length > 0 && (
        <ul className="space-y-2" aria-label="Clubs you are secretary for">
          {clubIds.map(clubId => (
            <li key={clubId} className="flex items-center gap-3 rounded-md border px-4 py-3">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">
                {clubs.find(club => club.id === clubId)?.name ?? 'Your club'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showCount > 0 && (
        <p className="text-sm text-muted-foreground">
          You also help with {showCount} {showCount === 1 ? 'show' : 'shows'} directly. They are on
          your dashboard.
        </p>
      )}

      {hasAppointment ? (
        <p className="text-sm text-muted-foreground">
          Working with another club? Ask its club admin, or use{' '}
          <StepLink to="/request-access" onNavigateAway={onNavigateAway}>
            Request additional access
          </StepLink>
          .
        </p>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No club has appointed you yet. Your club admin can appoint you, or you can{' '}
          <StepLink to="/request-access" onNavigateAway={onNavigateAway}>
            Request additional access
          </StepLink>
          .
        </p>
      )}

      <RoleStepFooter onBack={onBack} onNext={onNext} canGoBack={canGoBack} nextLabel={nextLabel} />
    </div>
  );
}
