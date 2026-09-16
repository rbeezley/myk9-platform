import React from 'react';
import { BaseEntityDialog } from './BaseEntityDialog';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';

export interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  title?: string | undefined;
  titleIcon?: React.ReactNode | undefined;
  description?: string | undefined;
  entityName: string;
  entityType: string;
  isDeleting?: boolean | undefined;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  /**
   * Rendered inline right after the entity name in the primary sentence, e.g.
   * " and 2 entries" → "You are about to delete <b>Dog 1</b> and 2 entries.".
   * Omit for the plain "You are about to delete <b>X</b>." form.
   */
  impactSuffix?: React.ReactNode | undefined;
  /**
   * Replaces the default "This action cannot be undone." line. Use when the
   * delete is reversible (e.g. a soft-delete that an admin can restore).
   */
  warningText?: React.ReactNode | undefined;
  /**
   * Blocks confirmation while still showing the dialog — use with `warningText`
   * carrying the reason. A delete the server will refuse should not be clickable.
   */
  confirmDisabled?: boolean | undefined;
  /**
   * Rendered below the warning line, inside the dialog body. Use for an
   * escalation the user must opt into deliberately — e.g. an admin override
   * checkbox that unlocks a delete the server would otherwise refuse. Keep it
   * to a single control; this is a confirmation dialog, not a form.
   */
  additionalContent?: React.ReactNode | undefined;
  /**
   * Report mode: nothing is about to be deleted (MYK9-600).
   *
   * The primary sentence — "You are about to delete <b>X</b>." — is an
   * assertion about what happens next, and the destructive triangle beside it
   * says how it will feel. Some callers reach this component to report that a
   * delete did NOT happen: `BlockedDogDeleteDialog` lists dogs the server
   * refused, under a title saying exactly that, with Close as the only action.
   * There the sentence is simply false, and it is the largest text on screen.
   *
   * `reportOnly` drops that sentence and swaps the triangle for a neutral
   * icon. It deliberately does NOT touch `warningText` or `additionalContent`:
   * removing a false claim must never remove the explanation that replaces it.
   */
  reportOnly?: boolean | undefined;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  titleIcon,
  description,
  entityName,
  entityType,
  isDeleting = false,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  impactSuffix,
  warningText = 'This action cannot be undone.',
  confirmDisabled = false,
  additionalContent,
  reportOnly = false,
}: DeleteConfirmationDialogProps) {
  const defaultTitle = title || `Delete ${entityType}`;
  // No trash can, and therefore none of CommonDialog's destructive red on the
  // title, when nothing is being deleted. CommonDialog wraps any titleIcon in
  // `text-destructive` unconditionally, so passing none is the only way to keep
  // a report from reading as a destructive confirmation.
  const defaultTitleIcon = titleIcon || (reportOnly ? undefined : <Trash2 className="w-5 h-5" />);
  const defaultDescription =
    description || `Are you sure you want to delete this ${entityType.toLowerCase()}?`;

  return (
    <BaseEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={defaultTitle}
      titleIcon={defaultTitleIcon}
      description={defaultDescription}
      onSubmit={onConfirm}
      submitLabel={confirmLabel}
      cancelLabel={cancelLabel}
      isSubmitting={isDeleting}
      submitDisabled={confirmDisabled}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {reportOnly ? (
            <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
          )}
          <div className="flex-1">
            {reportOnly ? null : (
              <p className="text-sm text-muted-foreground">
                You are about to delete <strong className="text-foreground">{entityName}</strong>
                {impactSuffix}.
              </p>
            )}
            <p className={`text-sm text-muted-foreground${reportOnly ? '' : ' mt-2'}`}>
              {warningText}
            </p>
            {additionalContent ? <div className="mt-3">{additionalContent}</div> : null}
          </div>
        </div>
      </div>
    </BaseEntityDialog>
  );
}
