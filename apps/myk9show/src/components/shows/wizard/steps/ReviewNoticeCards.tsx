import type React from 'react';
import { AlertTriangle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ENTRY_WINDOW_REQUIRED_MESSAGE,
  entryWindowPublishError,
} from '@/features/payments/onlineEntryGate';

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

interface ReviewEntryWindowNoticeProps {
  entryOpenDate: string | null | undefined;
  entryCloseDate: string | null | undefined;
  /** Jump back to the step that holds the Entry Period. */
  onSetWindow: () => void;
}

/**
 * MYK9-716: a draft may be saved without an entry window, but publishing
 * requires one (the status pill and enforce_show_publish_gate refuse it). Review
 * is where the wizard asks for it: a readiness item that links back to the
 * field, never a blocking error. Renders nothing once the window is valid.
 */
export function ReviewEntryWindowNotice({
  entryOpenDate,
  entryCloseDate,
  onSetWindow,
}: ReviewEntryWindowNoticeProps) {
  const problem = entryWindowPublishError(entryOpenDate, entryCloseDate);
  if (!problem) return null;
  const missing = problem === ENTRY_WINDOW_REQUIRED_MESSAGE;
  return (
    <ReviewWarningCard
      title={missing ? 'No entry window yet' : 'The entry window needs fixing'}
      actionLabel="Set the entry window"
      onAction={onSetWindow}
      data-testid="review-entry-window-warning"
    >
      {missing
        ? 'You can save this show as a draft, but it can’t be published until entries have an open and a close date. Go back to Show Details and set the Entry Period.'
        : 'Entries have to open before they close. You can save this show as a draft, but it can’t be published until the Entry Period is fixed.'}
    </ReviewWarningCard>
  );
}
