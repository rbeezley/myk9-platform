import type React from 'react';
import { AlertTriangle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WizardPublishBlockers } from '@/features/publishing/WizardPublishBlockers';

interface ReviewWarningCardProps {
  title: string;
  children: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  'data-testid'?: string;
}

/** The blocking problems that keep Create from saving the show. */
export function ReviewErrorCard({ errors }: { errors: string[] }) {
  return (
    <Card className="border-destructive/30 bg-destructive/10 ">
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-destructive mb-2">
              Please address the following issues:
            </h4>
            <ul className="space-y-1">
              {errors.map((error, index) => (
                <li key={index} className="text-sm text-destructive ">
                  • {error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A non-blocking Review warning: something the secretary should know before
 * saving, with a jump back to the step that fixes it. Never gates Create —
 * blocking problems belong in the error card.
 */
export function ReviewWarningCard({
  title,
  children,
  actionLabel,
  onAction,
  'data-testid': testId,
}: ReviewWarningCardProps) {
  return (
    <Card className="border-warning/30 bg-warning/10" data-testid={testId}>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-warning mb-1">{title}</h4>
            <p className="text-sm text-muted-foreground mb-2">{children}</p>
            <Button variant="outline" size="sm" onClick={onAction}>
              <Edit className="h-4 w-4 mr-1" />
              {actionLabel}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ReviewReadinessNoticesProps {
  unassignedPoolJudgeNames: string[];
  clubId: string | undefined;
  entryOpenDate: string | null | undefined;
  entryCloseDate: string | null | undefined;
  missingVenuePin: boolean;
  /** False when the edit mode cannot reach Show Details (add-classes): the notices that only link there are omitted. */
  canEditDetails: boolean;
  onGoToStep: (step: number) => void;
}

/** The non-blocking readiness notices at the top of Review. */
export function ReviewReadinessNotices({
  unassignedPoolJudgeNames,
  clubId,
  entryOpenDate,
  entryCloseDate,
  missingVenuePin,
  canEditDetails,
  onGoToStep,
}: ReviewReadinessNoticesProps) {
  return (
    <>
      {/* Unassigned pool judges — non-blocking warning */}
      {unassignedPoolJudgeNames.length > 0 && (
        <ReviewWarningCard
          title={
            unassignedPoolJudgeNames.length === 1
              ? '1 judge is not assigned to any class'
              : `${unassignedPoolJudgeNames.length} judges are not assigned to any class`
          }
          actionLabel="Assign judges to classes"
          onAction={() => onGoToStep(2)}
        >
          {unassignedPoolJudgeNames.join(', ')} won’t see this show on their judge dashboard until
          assigned to a class. Go back to Classes to assign them, or continue and assign judges
          later.
        </ReviewWarningCard>
      )}

      {/* MYK9-2198: the one "Before you can publish" list (it replaced the entry-window notice). */}
      {canEditDetails && (
        <WizardPublishBlockers
          clubId={clubId}
          entryOpenDate={entryOpenDate}
          entryCloseDate={entryCloseDate}
          onEditDetails={() => onGoToStep(0)}
        />
      )}

      {/* MYK9-686: location text with no pin is allowed, but never silent. */}
      {canEditDetails && missingVenuePin && (
        <ReviewWarningCard
          title="No map pin"
          actionLabel="Place the map pin"
          onAction={() => onGoToStep(0)}
          data-testid="review-missing-pin-warning"
        >
          This show won’t appear on the Find Shows map. Go back to Basics and locate the address or
          click the map.
        </ReviewWarningCard>
      )}
    </>
  );
}
