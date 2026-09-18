import { Dog, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  buildExhibitorRegistrationPath,
  buildSecretaryRegistrationPath,
} from '@/pages/RegistrationWizardPage.routes';

interface SecretaryAddEntriesDecisionProps {
  showId?: string | null | undefined;
  disabled?: boolean | undefined;
  /**
   * Set when the viewer manages this show but is NOT its trial secretary, so
   * `/secretary/register/:showId` — `ProtectedRoute(SECRETARY | SITE_ADMIN)` —
   * would refuse them. Only "Add entry for someone else" is withheld; "Add
   * entry for my dog" goes to the EXHIBITOR wizard (`/shows/:id/register`),
   * which carries no role requirement, so a club admin keeps it.
   *
   * Greyed with a one-line reason rather than hidden: the same treatment the
   * header Actions menu already gives this item (`TRIAL_SECRETARY_ONLY_REASON`),
   * so the two doors to the same action agree. Before MYK9-630 phase 3 this
   * body was ungated and a club admin's click landed on a bare permission wall.
   */
  mailInDisabledReason?: string | undefined;
}

/**
 * The two paths differ by WHOSE dog is being entered -- the exhibitor route
 * picks from your own dogs, the secretary route searches or creates any
 * exhibitor and dog. They do NOT differ by reason: "mail-in" was one cause
 * among several (a phone call, a walk-up, fixing an exhibitor's mistake) for
 * the identical action, and naming one of them made the rest look unsupported.
 * Vocabulary rule: docs/reference/ui-vocabulary.md.
 */
export function SecretaryAddEntriesDecision({
  showId,
  disabled = false,
  mailInDisabledReason,
}: SecretaryAddEntriesDecisionProps) {
  const navigate = useNavigate();
  const isDisabled = disabled || !showId;
  const mailInDisabled = isDisabled || mailInDisabledReason !== undefined;

  const handleNavigate = (pathBuilder: (id: string) => string) => {
    if (!showId) return;
    navigate(pathBuilder(showId));
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        role="group"
        aria-label="Add entries"
        className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
      >
        <Button
          type="button"
          variant="outline"
          disabled={isDisabled}
          className="w-full sm:w-auto"
          onClick={() => handleNavigate(buildExhibitorRegistrationPath)}
        >
          <Dog className="h-4 w-4 mr-2" />
          Add entry for my dog
        </Button>
        <Button
          type="button"
          disabled={mailInDisabled}
          className="w-full sm:w-auto"
          {...(mailInDisabledReason !== undefined
            ? { 'aria-describedby': 'secretary-add-entries-mail-in-reason' }
            : {})}
          onClick={() => handleNavigate(buildSecretaryRegistrationPath)}
        >
          <Users className="h-4 w-4 mr-2" />
          Add entry for someone else
        </Button>
      </div>
      {mailInDisabledReason !== undefined && (
        <p id="secretary-add-entries-mail-in-reason" className="text-xs text-muted-foreground">
          {mailInDisabledReason}
        </p>
      )}
    </div>
  );
}
