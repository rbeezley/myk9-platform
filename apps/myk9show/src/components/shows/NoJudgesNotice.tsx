import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { getShowJudgesHref } from './showEditRoutes';

/**
 * Shown wherever a class judge is assigned but the show has no judges to offer.
 *
 * F4 and F12 are the same dead end reached from two directions. A class judge can only
 * be chosen from the show's judge roster, and every surface that assigns one — the
 * creation wizard's class step, Manage Classes, the class Edit panel, Add Classes to
 * Trial — rendered either nothing at all, a disabled control, or a disabled
 * "No judges assigned to this show" option. Each stated or implied the problem and none
 * offered a way out, so the secretary had to already know that judges live on a
 * different screen.
 *
 * This is deliberately a POINTER, not a second judge editor. Judge management is
 * genuinely one concern with one home (the Edit panel's Judges tab, which can look up a
 * qualified judge, capture their credentials, or create a new one); reimplementing a
 * slice of it at each call site is what this phase of the project is trying to stop.
 *
 * Two shapes, because the two contexts differ in what "go add one" can mean:
 * - `showId` — link to the show's Judges tab. For surfaces acting on a SAVED show.
 * - `onAddJudge` — run an action instead. For the creation wizard, where the show does
 *   not exist yet and the roster lives on an earlier step of the same form.
 */
interface NoJudgesNoticeBaseProps {
  /** Overrides the default sentence when the surrounding copy needs to differ. */
  message?: string;
  className?: string;
}

type NoJudgesNoticeProps = NoJudgesNoticeBaseProps &
  (
    | { showId: string; onAddJudge?: never; actionLabel?: string }
    | { onAddJudge: () => void; showId?: never; actionLabel?: string }
  );

const DEFAULT_MESSAGE =
  'This show has no judges yet, so there is nobody to assign. Add a judge and they will be offered here.';

export const NoJudgesNotice: React.FC<NoJudgesNoticeProps> = ({
  showId,
  onAddJudge,
  actionLabel = 'Add a judge',
  message = DEFAULT_MESSAGE,
  className,
}) => (
  <div
    className={`rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm ${className ?? ''}`}
  >
    <p className="text-muted-foreground">{message}</p>
    {onAddJudge ? (
      <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" onClick={onAddJudge}>
        <UserPlus className="h-4 w-4" />
        {actionLabel}
      </Button>
    ) : (
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link to={getShowJudgesHref(showId!)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          {actionLabel}
        </Link>
      </Button>
    )}
  </div>
);
