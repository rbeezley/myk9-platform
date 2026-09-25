import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageShowComposer } from '@/features/show-workbench/MessageShowComposer';
import { useMessageShowClassOptions } from '@/features/messages/hooks/useMessageShowClassOptions';
import {
  resolveComposeShow,
  type ComposeShowOption,
} from '@/features/messages/messageComposeShows';
import type {
  MessageShowDeliveryLane,
  MessageShowRecipientType,
} from '@/features/show-workbench/messageShow';

export interface MessageCenterComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The shows this person may post to (`selectComposeShows`). */
  options: readonly ComposeShowOption[];
  /** The show of the page the composer was opened from, or ''. */
  routeShowId: string;
  /** A note shown above the known shows while more may still arrive. */
  pendingMessage: string | null;
  /** Shown when the list is known and empty, or could not be read. */
  emptyMessage: string;
  /** Lanes for a show the person manages; a judged show is always show-wide only. */
  manageRecipients: MessageShowRecipientType[];
  manageShowWideLane: MessageShowDeliveryLane;
}

const JUDGE_RECIPIENTS: MessageShowRecipientType[] = ['all_show'];

export function MessageCenterComposeDialog({
  open,
  onOpenChange,
  options,
  routeShowId,
  pendingMessage,
  emptyMessage,
  manageRecipients,
  manageShowWideLane,
}: MessageCenterComposeDialogProps) {
  const [pickedShowId, setPickedShowId] = useState('');
  const { selected, locked } = resolveComposeShow(options, routeShowId, pickedShowId);
  const selectedShowId = selected?.id ?? '';
  const isJudgeLane = selected?.lane === 'judge';
  const recipients = isJudgeLane ? JUDGE_RECIPIENTS : manageRecipients;
  // Only a class message needs the class list; a show-wide-only lane never reads it.
  const needsClasses = !!selectedShowId && recipients.includes('class');
  const {
    data: classes = [],
    isError: classesError,
    refetch: retryClasses,
  } = useMessageShowClassOptions(open && needsClasses ? selectedShowId : null, {
    enabled: open && needsClasses,
  });

  function renderShowField() {
    if (options.length === 0) {
      return pendingMessage ? null : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      );
    }
    // The destination is always visible: a locked show, or the only one on
    // offer, shows its name, so nobody posts show-wide without seeing where.
    if (selected && (locked || options.length === 1)) {
      return (
        <div className="space-y-1">
          <p className="text-sm font-medium">Show</p>
          <p className="text-sm text-muted-foreground">{selected.name}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <Label htmlFor="message-center-compose-show">Show</Label>
        <Select value={selectedShowId} onValueChange={value => setPickedShowId(value ?? '')}>
          <SelectTrigger id="message-center-compose-show">
            <SelectValue placeholder="Select a show" />
          </SelectTrigger>
          <SelectContent>
            {options.map(show => (
              <SelectItem key={show.id} value={show.id}>
                {show.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  function renderComposer() {
    if (!selectedShowId) {
      return options.length > 0 ? (
        <p className="text-sm text-muted-foreground">Select a show to continue.</p>
      ) : null;
    }
    if (needsClasses && classesError) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">
                Couldn't load classes for this show.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try again before sending a class message.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void retryClasses()}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return (
      // Keyed by show: the composer keeps its recipient choice in local state, and a
      // judged-only show allows fewer lanes than a managed one.
      <MessageShowComposer
        key={selectedShowId}
        showId={selectedShowId}
        classes={classes}
        allowedRecipients={recipients}
        showWideDeliveryLane={isJudgeLane ? 'announcement' : manageShowWideLane}
        showHistoryLink={false}
        onSent={() => onOpenChange(false)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose show message</DialogTitle>
          <DialogDescription>
            Send a show message to everyone, a class, or checked-in exhibitors.
          </DialogDescription>
        </DialogHeader>
        {pendingMessage && <p className="text-sm text-muted-foreground">{pendingMessage}</p>}
        {renderShowField()}
        {renderComposer()}
      </DialogContent>
    </Dialog>
  );
}
