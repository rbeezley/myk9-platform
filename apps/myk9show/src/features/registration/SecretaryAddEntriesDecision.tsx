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
}: SecretaryAddEntriesDecisionProps) {
  const navigate = useNavigate();
  const isDisabled = disabled || !showId;

  const handleNavigate = (pathBuilder: (id: string) => string) => {
    if (!showId) return;
    navigate(pathBuilder(showId));
  };

  return (
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
        disabled={isDisabled}
        className="w-full sm:w-auto"
        onClick={() => handleNavigate(buildSecretaryRegistrationPath)}
      >
        <Users className="h-4 w-4 mr-2" />
        Add entry for someone else
      </Button>
    </div>
  );
}
