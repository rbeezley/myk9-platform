import { useState } from 'react';
import {
  ClipboardCheck,
  ExternalLink,
  ListOrdered,
  Megaphone,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useTrialSecretaryOnlyReason } from '@/features/actions/TrialSecretaryAccessContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RunOrderPresetItems } from '../ShowMapRunOrderMenu';
import { AnnounceDelayPanel } from './AnnounceDelayPanel';
import { getCockpitPaperScoringHref, getShowHomeHref } from './cockpitRoutes';
import type { SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';

export interface FocusedClassEditAction {
  /** Locked while a class edit is resolving or open (useFocusedClassSetupActions). */
  disabled: boolean;
  onSelect: () => void;
}

/**
 * The focused class's one Actions menu (MYK9-1796): everything a secretary DOES to the class, a
 * ⋯ button pinned top-right of the header card like the trial card's. Status, expected start and
 * actual timing are inline fields under the title (MYK9-1867, FocusedClassFields), not items here.
 * Score this class links to the paper scoring route the step bar uses. Someone who cannot manage
 * the show gets a plain link, since View entries and results is then the only item.
 */
export function FocusedClassActionsMenu({
  showId,
  classId,
  className,
  canManageShow,
  offerDelay,
  delayMinutes,
  runOrder,
  runOrderEntryCount,
  editClass,
  entriesHref,
}: {
  showId: string;
  classId: string;
  className: string;
  canManageShow: boolean;
  /** Not started, and a delay is known or a revised start stands with no scheduled time to compare to. */
  offerDelay: boolean;
  delayMinutes: number | undefined;
  runOrder: SecretaryCockpitRunOrderControls | undefined;
  runOrderEntryCount: number;
  editClass: FocusedClassEditAction | undefined;
  /** The class's `class-details:` destination; absent when the snapshot offers none. */
  entriesHref: string | null;
}) {
  const [delayOpen, setDelayOpen] = useState(false);
  const secretaryOnlyReason = useTrialSecretaryOnlyReason();
  // The same destination the class step bar's scoring step opens.
  const scoringHref = getCockpitPaperScoringHref({
    classId,
    returnTo: getShowHomeHref({ showId, state: { statuses: [], focusedClassId: classId } }),
  });

  const entriesLink = entriesHref && (
    <Link to={entriesHref} className="flex w-full items-center gap-2">
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
      View entries and results
    </Link>
  );

  if (!canManageShow) {
    return entriesHref ? (
      <Button asChild variant="outline" size="touch" className="gap-2">
        <Link to={entriesHref}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          View entries and results
        </Link>
      </Button>
    ) : null;
  }

  const showDelay = offerDelay;
  // INTENT: Sorting a 0- or 1-entry class is meaningless, so Run order is hidden entirely
  // rather than rendered as a disabled affordance.
  const showRunOrder = runOrder !== undefined && runOrderEntryCount >= 2;
  const sortLocked = runOrder?.isAutoSorting ?? false;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild nativeButton>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 p-0"
            aria-label={`Actions for ${className}`}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {editClass && (
            <DropdownMenuItem disabled={editClass.disabled} onClick={editClass.onSelect}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit class
            </DropdownMenuItem>
          )}
          {secretaryOnlyReason !== undefined ? (
            <DropdownMenuItem disabled title={secretaryOnlyReason}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Score this class
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link to={scoringHref} className="flex w-full items-center gap-2">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Score this class
              </Link>
            </DropdownMenuItem>
          )}
          {showDelay && (
            <DropdownMenuItem onClick={() => setDelayOpen(true)}>
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              Announce a delay
            </DropdownMenuItem>
          )}
          {showRunOrder && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={sortLocked}>
                  <ListOrdered className="h-4 w-4" aria-hidden="true" />
                  Auto-sort run order
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <RunOrderPresetItems
                    classId={classId}
                    classLabel={className}
                    onAutoSort={runOrder.onAutoSort}
                    disabled={sortLocked}
                  />
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    Armband and Random sort the dogs still waiting again and replace anything placed
                    by hand.
                  </p>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
          {entriesLink && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>{entriesLink}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {showDelay && (
        <AnnounceDelayPanel
          showId={showId}
          className={className}
          delayMinutes={delayMinutes}
          open={delayOpen}
          onOpenChange={setDelayOpen}
        />
      )}
    </>
  );
}
