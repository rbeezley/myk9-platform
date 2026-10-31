import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTrialSecretaryOnlyReason } from '@/features/actions/TrialSecretaryAccessContext';
import { buildAddEntryForExhibitorPath } from '@/pages/RegistrationWizardPage.routes';
import { formatConfirmationNumberLabel } from '@/features/registration/confirmationNumberDisplay';
import type { EntryStatus } from '@/types/show-registration-types';
import { EnrollmentCard } from './EnrollmentCard';
import type { EnrollmentCardProps } from './EnrollmentCard.types';
import type { ShowRegistrationGroup } from './showRegistrationProjection';
import { getRegistrationReviewLabel } from './reviewStateLabels';
import { EntryFormChecklist } from './EntryFormChecklist';
import { EntryFormFooter } from './EntryFormFooter';
import { EntryFormHeaderMenu } from './EntryFormHeaderMenu';
import { buildFormChecklist } from './formChecklist';
import { useEnrollmentDialogControls } from './useEnrollmentDialogControls';

interface EntryFocusedRegistrationProps extends Omit<EnrollmentCardProps, 'group'> {
  registration: ShowRegistrationGroup;
  /** Accept/Reject for the checklist and the header menu (the shared bulk handler). */
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBack?: () => void;
  /**
   * Move focus to the form's heading when it opens. On a narrow screen the form replaces the
   * list, so the row that was tapped is gone and focus would otherwise fall to the page.
   */
  focusHeadingOnMount?: boolean;
}

const reviewLabel = getRegistrationReviewLabel;

export function EntryFocusedRegistration({
  registration,
  onBack,
  onBulkStatusChange,
  focusHeadingOnMount = false,
  ...enrollmentCardProps
}: EntryFocusedRegistrationProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // On mount only: the form is keyed by registration, so each open is one mount, and a resize
  // into the narrow layout with a form already open does not move focus.
  useEffect(() => {
    if (focusHeadingOnMount) headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const controls = useEnrollmentDialogControls(registration, enrollmentCardProps.paymentLedger);
  const checklist = buildFormChecklist(registration, controls);
  // Another class or dog for someone already entered (MYK9-1594). The exhibitor is the dogs'
  // owner, who is also whose enrollment the new entries join.
  const secretaryOnlyReason = useTrialSecretaryOnlyReason();
  const firstEntry = registration.entries[0];
  const exhibitorId = firstEntry?.ownerId ?? firstEntry?.handlerId ?? null;
  // Only a form with an enrollment row: new entries join that enrollment (one per person per
  // show). An online-checkout group (`pi:`/`entry:` key) has none, so the new entries would land
  // on a different form; the header Actions → Add entry stays the path there.
  const addEntry =
    firstEntry && exhibitorId && registration.enrollmentId
      ? {
          href: buildAddEntryForExhibitorPath(
            firstEntry.showId,
            exhibitorId,
            registration.groupKey
          ),
          disabledReason: secretaryOnlyReason,
        }
      : undefined;

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label={`Entry form for ${registration.exhibitorName}`}
    >
      <header className="border-b px-5 py-4">
        {onBack && (
          <Button variant="ghost" size="sm" className="-ml-2 mb-2 gap-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to list
          </Button>
        )}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Entry form
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-xl font-bold focus:outline-none"
            >
              {registration.exhibitorName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {registration.confirmationNumber
                ? formatConfirmationNumberLabel(registration.confirmationNumber)
                : 'No confirmation number'}{' '}
              · {registration.exhibitorEmail || 'No email'}
            </p>
          </div>
          <EntryFormHeaderMenu
            exhibitorName={registration.exhibitorName}
            entries={registration.entries}
            onBulkStatusChange={onBulkStatusChange}
            addEntry={addEntry}
            onEmailExhibitor={
              enrollmentCardProps.onSendDecisionEmail && registration.enrollmentId
                ? controls.email.openDialog
                : undefined
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'font-medium',
              registration.attentionReasons.includes('missing_information') &&
                'border-destructive/40 bg-destructive/10 text-destructive',
              registration.attentionReasons.includes('pending_review') &&
                !registration.attentionReasons.includes('missing_information') &&
                'border-warning/40 bg-warning/10 text-warning'
            )}
          >
            {reviewLabel(registration)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {registration.entryCount} {registration.entryCount === 1 ? 'Entry' : 'Entries'} ·{' '}
            {registration.dogCount} {registration.dogCount === 1 ? 'Dog' : 'Dogs'}
          </span>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <EntryFormChecklist
          checklist={checklist}
          onBulkStatusChange={onBulkStatusChange}
          onOpenArmbandDialog={enrollmentCardProps.onOpenArmbandDialog}
          onOpenEditEntry={enrollmentCardProps.onOpenEditEntry}
          payment={controls}
        />

        <EnrollmentCard group={registration} {...enrollmentCardProps} dialogControls={controls} />
      </div>

      <EntryFormFooter
        totalDollars={controls.totalDollars}
        paidDollars={controls.paidDollars}
        remainingDollars={controls.remainingDollars}
      />
    </section>
  );
}
