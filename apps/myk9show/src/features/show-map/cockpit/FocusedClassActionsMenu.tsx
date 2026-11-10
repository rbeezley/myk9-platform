import { useState } from 'react';
import {
  ChevronDown,
  Clock3,
  ExternalLink,
  GripVertical,
  ListChecks,
  ListOrdered,
  Megaphone,
  Pencil,
  PlayCircle,
  Timer,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { AnnounceDelayButton } from './AnnounceDelayButton';
import {
  ClassStatusChoices,
  ExpectedStartControl,
  STATUS_LABEL,
  useClassStatusChange,
} from './ClassOperationalControls';
import type { CockpitLifecycle, SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';

export interface FocusedClassEditAction {
  /** Locked while a class edit is resolving or open (useFocusedClassSetupActions). */
  disabled: boolean;
  onSelect: () => void;
}

/**
 * The focused class's one Actions menu (MYK9-1796): everything a secretary DOES to the class,
 * replacing the Edit class button, the inline status, expected start and run-order controls and
 * the Class work links. Every item reuses the control it replaced (status change with its
 * confirmation, expected start editor, actual start editor, delay script, run-order handlers); a
 * dialog here only hosts the existing editor. Someone who cannot manage the show gets a plain
 * link, since View entries and results is then the only item.
 */
export function FocusedClassActionsMenu({
  showId,
  classId,
  className,
  lifecycle,
  unenteredScoreCount,
  canManageShow,
  scheduledStart,
  revisedExpectedStart,
  trialDate,
  timeZone,
  offerDelay,
  delayMinutes,
  runOrder,
  runOrderEntryCount,
  editClass,
  onEditActualStart,
  onPlaceByHand,
  entriesHref,
}: {
  showId: string;
  classId: string;
  className: string;
  lifecycle: CockpitLifecycle | null;
  /** Null when the entry counts are unknown, which Complete must confirm rather than read as 0. */
  unenteredScoreCount: number | null;
  canManageShow: boolean;
  scheduledStart: string | null;
  revisedExpectedStart: string | null;
  trialDate: string;
  timeZone: string;
  /** Not started, and a delay is known or a revised start stands with no scheduled time to compare to. */
  offerDelay: boolean;
  delayMinutes: number | undefined;
  runOrder: SecretaryCockpitRunOrderControls | undefined;
  runOrderEntryCount: number;
  editClass: FocusedClassEditAction | undefined;
  onEditActualStart: () => void;
  onPlaceByHand: () => void;
  /** The class's `class-details:` destination; absent when the snapshot offers none. */
  entriesHref: string | null;
}) {
  const [expectedOpen, setExpectedOpen] = useState(false);
  const [delayOpen, setDelayOpen] = useState(false);
  const status = useClassStatusChange({ classId, unenteredScoreCount });

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
  const statusLabel = lifecycle ? STATUS_LABEL[lifecycle] : 'Status unknown';
  const sortLocked = runOrder?.isAutoSorting ?? false;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild nativeButton>
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="gap-2"
            aria-label={`Actions for ${className}`}
          >
            Actions
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {editClass && (
            <DropdownMenuItem disabled={editClass.disabled} onClick={editClass.onSelect}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit class
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={status.isSaving}>
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Change class status
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <ClassStatusChoices label={statusLabel} onSelect={status.update} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => setExpectedOpen(true)}>
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Set expected start
          </DropdownMenuItem>
          {/* The editor lives in the class checklist, which a cancelled class does not have. */}
          {lifecycle !== 'cancelled' && (
            <DropdownMenuItem onClick={onEditActualStart}>
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              Set actual start
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
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem disabled={sortLocked} onClick={onPlaceByHand}>
                <GripVertical className="h-4 w-4" aria-hidden="true" />
                Place by hand
              </DropdownMenuItem>
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

      {status.confirmDialog}

      <Dialog open={expectedOpen} onOpenChange={setExpectedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-4 w-4" aria-hidden="true" />
              Set expected start
            </DialogTitle>
            <DialogDescription>
              {className}
              {scheduledStart ? ` is scheduled for ${scheduledStart}.` : '.'} The scheduled time is
              kept.
            </DialogDescription>
          </DialogHeader>
          <ExpectedStartControl
            classId={classId}
            scheduledStart={scheduledStart}
            revisedExpectedStart={revisedExpectedStart}
            trialDate={trialDate}
            timeZone={timeZone}
            canManageShow={canManageShow}
            editing={expectedOpen}
            onEditingChange={setExpectedOpen}
          />
        </DialogContent>
      </Dialog>

      {showDelay && (
        <AnnounceDelayButton
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
