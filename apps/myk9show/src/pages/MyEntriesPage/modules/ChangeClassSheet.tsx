/**
 * "Change class…" from a My Shows class row (MYK9-1978, plan-class-change-requests
 * Phase 2): pick the class, pick why, send.
 *
 * It only ASKS. The entry stays where it is and keeps its place until the
 * secretary accepts. Online only: the request is awaited and never queued, and
 * offline the sheet says so rather than pretending to send.
 *
 * No fee line: a show has one entry fee and class fees are MYK9-1931.
 *
 * @module MyEntriesPage/modules/ChangeClassSheet
 */

import React from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { useQueryOnlineStatus } from '@/hooks/guestServerRead';
import {
  CLASS_CHANGE_REASONS,
  CLASS_CHANGE_REASON_LABELS,
  requestClassChange,
  type ClassChangeReason,
} from '@/services/database/entries/classChangeRequests';
import {
  CLASS_CHANGE_OFFLINE_MESSAGE,
  classChangeErrorMessage,
} from '@/services/database/entries/classChangeErrorMessage';
import { logger } from '@/services/LoggingService';
import { trialStartInstant } from '@/features/show-map/trialStartInstant';
import {
  CLASS_CHANGE_SOON_MINUTES,
  isLateClassChange,
  minutesBeforeStart,
} from '@/features/show-map/classChangeLateness';
import { listChangeClassOptions } from './changeClassRow';

export interface ChangeClassSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The class row's `entries.id`. */
  entryId: string;
  showId: string;
  dogName: string;
  className: string;
  currentClassId: string | undefined;
  /** Every class this dog is already entered in at the show. */
  dogClassIds: ReadonlySet<string>;
  /** Re-read the entries once the server has the request. */
  onSent: () => void | Promise<void>;
}

export const ChangeClassSheet: React.FC<ChangeClassSheetProps> = ({
  open,
  onOpenChange,
  entryId,
  showId,
  dogName,
  className,
  currentClassId,
  dogClassIds,
  onSent,
}) => {
  const isOnline = useQueryOnlineStatus();
  const availability = useClassAvailability(showId, { enabled: open && isOnline });
  const [targetClassId, setTargetClassId] = React.useState('');
  const [reason, setReason] = React.useState<ClassChangeReason | ''>('');
  const [isSending, setIsSending] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const options = listChangeClassOptions({
    classes: availability.classes,
    currentClassId,
    dogClassIds,
  });
  const chosen = options.find(option => option.classId === targetClassId);
  // Asked inside the deadline still sends; the club is told it may not be accepted.
  const chosenClass = availability.classes.find(cls => cls.classId === targetClassId);
  const isLate =
    chosenClass !== undefined &&
    isLateClassChange(
      minutesBeforeStart(
        new Date(),
        trialStartInstant({
          id: chosenClass.trialId,
          trialDate: chosenClass.trialDate,
          plannedStartTime: chosenClass.trialPlannedStartTime,
          timezone: chosenClass.trialTimezone,
        })
      )
    );

  const send = async () => {
    if (!targetClassId || !reason) return;
    setIsSending(true);
    setFailure(null);
    try {
      const { error } = await requestClassChange({ entryId, targetClassId, reason });
      if (error) {
        setFailure(classChangeErrorMessage(error));
        return;
      }
      toast.success(`Class change requested for ${dogName}. Waiting for the secretary.`);
      onOpenChange(false);
      await onSent();
    } catch (err) {
      logger.error('Class change request failed', 'entries', { entryId }, err as Error);
      setFailure(classChangeErrorMessage(null));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={next => !isSending && onOpenChange(next)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Change class</SheetTitle>
          <SheetDescription>
            Ask the secretary to move {dogName} out of {className}. {dogName} stays in {className}{' '}
            until the secretary accepts.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {!isOnline && (
            <Alert>
              <AlertDescription>{CLASS_CHANGE_OFFLINE_MESSAGE}</AlertDescription>
            </Alert>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Move to</legend>
            {availability.isLoading && isOnline && (
              <p className="text-sm text-muted-foreground">Loading classes…</p>
            )}
            {availability.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  We could not load this show&rsquo;s classes. Please try again.
                </AlertDescription>
              </Alert>
            )}
            {!availability.isLoading && !availability.error && options.length === 0 && isOnline && (
              <p className="text-sm text-muted-foreground">
                There is no other class this entry could move to.
              </p>
            )}
            <RadioGroup value={targetClassId} onValueChange={setTargetClassId}>
              {options.map(option => (
                <label
                  key={option.classId}
                  className="flex min-h-[44px] items-center gap-3 text-sm"
                >
                  <RadioGroupItem value={option.classId} disabled={option.state === 'full'} />
                  <span>
                    {option.name}
                    {option.trialLabel ? ` · ${option.trialLabel}` : ''}
                    {option.state === 'full' && (
                      <span className="ml-2 text-muted-foreground">Full</span>
                    )}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          {isLate && (
            <Alert role="status">
              <AlertDescription>
                This is less than {CLASS_CHANGE_SOON_MINUTES} minutes before the trial starts. The
                club may not be able to accept it.
              </AlertDescription>
            </Alert>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Why</legend>
            <RadioGroup
              value={reason}
              onValueChange={(value: ClassChangeReason) => setReason(value)}
            >
              {CLASS_CHANGE_REASONS.map(code => (
                <label key={code} className="flex min-h-[44px] items-center gap-3 text-sm">
                  <RadioGroupItem value={code} />
                  <span>{CLASS_CHANGE_REASON_LABELS[code]}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          {failure && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            onClick={() => void send()}
            disabled={!isOnline || isSending || !chosen || chosen.state === 'full' || !reason}
          >
            {isSending ? 'Sending…' : 'Send request'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
