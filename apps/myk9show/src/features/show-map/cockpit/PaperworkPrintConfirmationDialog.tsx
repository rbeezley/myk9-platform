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
  return (
    <div role="group" aria-label={`Confirm ${reportLabel} printed`} className="mt-2 space-y-2">
      <p className="text-sm font-medium">Did the {reportLabel} print correctly?</p>
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
