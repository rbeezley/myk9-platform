import { Dog, FileText } from 'lucide-react';
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
        Enter my dogs
      </Button>
      <Button
        type="button"
        disabled={isDisabled}
        className="w-full sm:w-auto"
        onClick={() => handleNavigate(buildSecretaryRegistrationPath)}
      >
        <FileText className="h-4 w-4 mr-2" />
        Record exhibitor or paper entry
      </Button>
    </div>
  );
}
