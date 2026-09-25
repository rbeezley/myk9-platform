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
  /** Shown instead of the picker while the option list is still being determined. */
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
  // Wait for a pending list before offering a picker the route show may still join.
  const waitingForList = pendingMessage !== null && (!selected || !locked);
  const selectedShowId = waitingForList ? '' : (selected?.id ?? '');
  const {
    data: classes = [],
    isError: classesError,
    refetch: retryClasses,
  } = useMessageShowClassOptions(open && selectedShowId ? selectedShowId : null, {
    enabled: open && !!selectedShowId,
  });
  const isJudgeLane = selected?.lane === 'judge';

  function renderShowField() {
    if (waitingForList) {
      return <p className="text-sm text-muted-foreground">{pendingMessage}</p>;
    }
    if (options.length === 0) {
      return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
    }
    if (locked && selected) {
      return (
        <div className="space-y-1">
          <p className="text-sm font-medium">Show</p>
          <p className="text-sm text-muted-foreground">{selected.name}</p>
        </div>
      );
    }
    if (options.length === 1) return null;
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
      return options.length > 0 && !waitingForList ? (
        <p className="text-sm text-muted-foreground">Select a show to continue.</p>
      ) : null;
    }
    if (classesError) {
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
      <MessageShowComposer
        showId={selectedShowId}
        classes={classes}
        allowedRecipients={isJudgeLane ? JUDGE_RECIPIENTS : manageRecipients}
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
        {renderShowField()}
        {renderComposer()}
      </DialogContent>
    </Dialog>
  );
}
