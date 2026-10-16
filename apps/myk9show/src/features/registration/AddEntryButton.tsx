import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TRIAL_SECRETARY_ONLY_REASON } from '@/features/actions/trialSecretaryAccess';
import {
  buildExhibitorRegistrationPath,
  buildSecretaryRegistrationPath,
} from '@/pages/RegistrationWizardPage.routes';

interface AddEntryButtonProps {
  showId?: string | null | undefined;
  /**
   * `trialSecretaryOnlyReason(...)` for this viewer: `undefined` when they may
   * operate the show, otherwise why they may not. See `trialSecretaryAccess.ts`.
   */
  secretaryOnlyReason?: string | undefined;
}

/**
 * The one Add Entry control on Entry Forms (MYK9-1242). The trial secretary goes
 * straight to the secretary flow, which searches every dog -- hers included --
 * so there is no "whose dog" choice to put in front of her.
 *
 * A manager who is NOT the trial secretary (a club admin) cannot enter
 * `/secretary/register/:showId` (`ProtectedRoute(SECRETARY | SITE_ADMIN)`), so
 * for them the same button leads to the exhibitor own-dog path, which carries no
 * role requirement. While the access answer is still in flight the button waits
 * rather than guessing, so a real secretary never sees the club-admin wording.
 */
export function AddEntryButton({ showId, secretaryOnlyReason }: AddEntryButtonProps) {
  const navigate = useNavigate();
  const ownDogOnly = secretaryOnlyReason === TRIAL_SECRETARY_ONLY_REASON;
  const waiting = secretaryOnlyReason !== undefined && !ownDogOnly;
  const disabled = !showId || waiting;

  return (
    <Button
      type="button"
      disabled={disabled}
      title={waiting ? secretaryOnlyReason : undefined}
      className="gap-2"
      onClick={() => {
        if (!showId) return;
        navigate(
          ownDogOnly
            ? buildExhibitorRegistrationPath(showId)
            : buildSecretaryRegistrationPath(showId)
        );
      }}
    >
      <Plus className="h-4 w-4" aria-hidden />
      {ownDogOnly ? 'Add entry for my dog' : 'Add Entry'}
    </Button>
  );
}
