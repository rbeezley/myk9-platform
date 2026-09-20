import React from 'react';
import { CheckCircle } from 'lucide-react';
import { ShowAccessCodesCard } from '@/components/secretary/ShowAccessCodesCard';
import { Button } from '@/components/ui/button';
import type { CreatedShow } from './show-creation-wizard-types';

interface WizardSuccessOverlayProps {
  createdShow: CreatedShow;
  onReviewShow: () => void;
}

/**
 * Full-screen confirmation shown after a show is created, before navigating
 * away. Intentionally calm: a static success overlay with no confetti.
 *
 * INTENT: Show creation is the secretary's admin task, not a dog's earned
 * moment, so it stays in the working register — the celebration register
 * (confetti, Fraunces) is reserved for placements/titles per DESIGN.md and
 * docs/INTENT.md. Do not re-add a confetti burst here. (Removed in PR #912.)
 */
export const WizardSuccessOverlay: React.FC<WizardSuccessOverlayProps> = ({
  createdShow,
  onReviewShow,
}) => (
  <div className="fixed inset-0 z-50 max-h-[100dvh] overflow-y-auto bg-background">
    <div className="flex min-h-full flex-col items-center justify-center gap-6 p-4 sm:p-8">
      <CheckCircle className="h-16 w-16 text-success" />
      <div className="text-center">
        <h1 className="text-3xl font-bold">Show Created!</h1>
        <p className="mt-1 text-muted-foreground">{createdShow.name}</p>
      </div>
      <div className="w-full max-w-md space-y-2 text-center">
        <h2 className="text-xl font-semibold">Role-specific access codes</h2>
        <p className="text-sm text-muted-foreground">
          The Judge and Steward codes are ringside access codes for assigned judges and stewards to
          open the ringside scoring tools.
        </p>
        <p className="text-sm text-muted-foreground">
          Share Judge and Steward codes only with assigned show officials. Admin and Exhibitor codes
          are for their named roles and do not replace normal myK9Show account or exhibitor sign-in.
        </p>
      </div>
      <div className="w-full max-w-md">
        <ShowAccessCodesCard
          showId={createdShow.id}
          showName={createdShow.name}
          passcodes={createdShow.passcodes}
          {...(createdShow.passcodeError ? { initialError: createdShow.passcodeError } : {})}
          canRegenerate
        />
      </div>
      <Button size="lg" onClick={onReviewShow}>
        Review &amp; Publish Show
      </Button>
    </div>
  </div>
);
