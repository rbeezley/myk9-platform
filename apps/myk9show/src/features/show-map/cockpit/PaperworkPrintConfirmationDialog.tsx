import { useEffect, useId, useRef } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const CONFIRM_BODY =
  'Mark it printed only after you confirm the physical pages or labels. This shares the time and your name with other secretaries.';

/** The same question as the dialog, in place, for a row hosted in a slide-out. */
export function PaperworkPrintConfirmationInline({
  reportLabel,
  isSaving,
  onConfirm,
  onCancel,
}: {
  reportLabel: string;
  isSaving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  // The question appears under the control that asked it, so focus moves into it.
  useEffect(() => {
    groupRef.current?.focus();
  }, []);
  return (
    <div
      ref={groupRef}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="mt-2 space-y-2 outline-none"
    >
      <p id={titleId} className="text-sm font-medium">
        Did the {reportLabel} print correctly?
      </p>
      <p className="text-xs text-muted-foreground">{CONFIRM_BODY}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={isSaving}
          onClick={onCancel}
        >
          Not yet
        </Button>
        <Button type="button" className="min-h-11" disabled={isSaving} onClick={onConfirm}>
          {isSaving ? 'Saving…' : 'Mark printed'}
        </Button>
      </div>
    </div>
  );
}

export function PaperworkPrintConfirmationDialog({
  open,
  reportLabel,
  isSaving,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  reportLabel: string;
  isSaving: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Did the {reportLabel} print correctly?</AlertDialogTitle>
          <AlertDialogDescription>{CONFIRM_BODY}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Not yet</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Mark printed'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
