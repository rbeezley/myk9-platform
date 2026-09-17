import React, { ReactNode } from 'react';
import { CommonDialog } from '@/components/common/CommonDialog';
import { errorReason } from '@/hooks/bulkDispatch';
import { logger } from '@/services/LoggingService';
import DialogFooterButtons from '@/components/common/DialogFooterButtons';

export interface BaseEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  titleIcon?: React.ReactNode;
  description?: string | undefined;
  children: ReactNode;
  onSubmit?: () => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  maxWidth?: string;
  /** Render the submit action as destructive (see DialogFooterButtons). */
  destructive?: boolean;
  showFooter?: boolean;
  /**
   * Disables the submit action while leaving the dialog open and readable. For a
   * refusal the user can act on elsewhere — the dialog still has to explain it,
   * so closing the dialog or hiding the button would take the explanation with
   * it.
   */
  submitDisabled?: boolean;
}

export function BaseEntityDialog({
  open,
  onOpenChange,
  title,
  titleIcon,
  description,
  children,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  maxWidth,
  destructive,
  showFooter = true,
  submitDisabled = false,
}: BaseEntityDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleSubmit = () => {
    // Callers report their own failures; consume rejected async handlers so a
    // handled refusal does not become an unhandledrejection.
    //
    // MYK9-593: consume, but never discard. The swallow used to be total, so a
    // throw the caller does not report itself — getLabel, claimFailure, or
    // toast.error — left the user with a closed dialog and no message anywhere.
    //
    // `reason` carries the message: LoggingService.error records only
    // `{ ...metadata, stack: error?.stack }`, so the message itself is dropped,
    // and a non-Error rejection (a string, a Supabase error object) has no
    // `.stack` at all and would log nothing usable. The Error argument is passed
    // only when it really is one.
    //
    // errorReason, not String(error): this layer's DatabaseError is an object
    // LITERAL (createDatabaseError), so String() renders it "[object Object]"
    // and loses the one field worth having. The helper reads `message` off any
    // error-like object. It does not carry a DatabaseError `code`; the message
    // is what identifies the failure here.
    //
    // Where this lands: the console in dev, `VITE_LOG_ENDPOINT` when one is
    // configured, and localStorage in the browser (see LoggingService
    // setupTransports). No transport routes it to Sentry today.
    void Promise.resolve(onSubmit?.()).catch((error: unknown) => {
      logger.error(
        'BaseEntityDialog submit rejected',
        'components',
        { title, reason: errorReason(error) },
        error instanceof Error ? error : undefined
      );
    });
  };

  return (
    // CommonDialog directly, NOT StandardDialog: the actions must go in
    // CommonDialog's `footer` slot, which sits OUTSIDE the scrolling body and is
    // `shrink-0`. StandardDialog builds its own footer from its own props and
    // only offers `hideSave` to suppress it, so reaching the slot through it
    // meant rendering the buttons inside `children` instead — i.e. inside the
    // scroll region.
    //
    // MYK9-584: that is why a tall delete dialog hid its own primary action. On
    // a 720px-high viewport the blocked-delete dialog capped at 90vh (648px)
    // while "Delete anyway" landed at y=737 — below the viewport AND below the
    // dialog's own bottom edge, with no scroll affordance. Measured in
    // dogsBulkDeleteBlocked.spec.ts, which now asserts the button is in view.
    <CommonDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      titleIcon={titleIcon}
      description={description}
      {...(maxWidth !== undefined && { maxWidth })}
      footer={
        showFooter ? (
          <DialogFooterButtons
            onCancel={handleCancel}
            onSubmit={handleSubmit}
            cancelLabel={cancelLabel}
            saveLabel={submitLabel}
            isSubmitting={isSubmitting}
            {...(submitDisabled && { saveButtonProps: { disabled: true } })}
            showIcons={
              submitLabel !== 'Delete' && !submitLabel?.toString().toLowerCase().includes('delete')
            }
            {...(destructive !== undefined && { destructive })}
          />
        ) : null
      }
    >
      <div className="space-y-4">{children}</div>
    </CommonDialog>
  );
}
