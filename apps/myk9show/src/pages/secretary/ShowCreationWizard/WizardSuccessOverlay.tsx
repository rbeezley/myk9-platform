import React from 'react';
import { CheckCircle } from 'lucide-react';
import { ShowAccessCodesCard } from '@/components/secretary/ShowAccessCodesCard';
import { Button } from '@/components/ui/button';
import type { CreatedShow } from './show-creation-wizard-types';

interface WizardSuccessOverlayProps {
  createdShow: CreatedShow;
  onGoToDashboard: () => void;
}

/**
 * Full-screen confirmation shown after a show is created, before navigating
 * away. The confetti burst is owned by the page (it keys off `createdShow`);
 * this component renders only the static overlay content.
 */
export const WizardSuccessOverlay: React.FC<WizardSuccessOverlayProps> = ({
  createdShow,
  onGoToDashboard,
}) => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background p-8">
    <CheckCircle className="h-16 w-16 text-green-500" />
    <div className="text-center">
      <h1 className="text-3xl font-bold">Show Created!</h1>
      <p className="mt-1 text-muted-foreground">{createdShow.name}</p>
    </div>
    <div className="w-full max-w-md">
      <ShowAccessCodesCard
        showId={createdShow.id}
        showName={createdShow.name}
        passcodes={createdShow.passcodes}
      />
    </div>
    <Button size="lg" onClick={onGoToDashboard}>
      Go to Dashboard
    </Button>
  </div>
);
