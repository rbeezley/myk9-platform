import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface ScoringModeWrapperProps {
  classId: string;
  showId: string;
  trialId: string;
  onBack: () => void;
}

/**
 * Redirects to the dedicated paper scoresheet entry page.
 * Previously rendered ClassResultsTable inline; now delegates to PaperScoresheetPage.
 */
export function ScoringModeWrapper({ classId }: ScoringModeWrapperProps) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/scoring/classes/${classId}/entries`);
  }, [classId, navigate]);

  return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
