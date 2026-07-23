import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatConfirmationNumberLabel } from '@/features/registration/confirmationNumberDisplay';
import { EnrollmentCard } from './EnrollmentCard';
import type { EnrollmentCardProps } from './EnrollmentCard.types';
import type { ShowRegistrationGroup } from './showRegistrationProjection';
import { getRegistrationReviewLabel } from './reviewStateLabels';

interface EntryFocusedRegistrationProps extends Omit<EnrollmentCardProps, 'group'> {
  registration: ShowRegistrationGroup;
  onBack?: () => void;
}

const reviewLabel = getRegistrationReviewLabel;

export function EntryFocusedRegistration({
  registration,
  onBack,
  ...enrollmentCardProps
}: EntryFocusedRegistrationProps) {
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label={`Focused registration for ${registration.exhibitorName}`}
    >
      <header className="border-b px-5 py-4">
        {onBack && (
          <Button variant="ghost" size="sm" className="-ml-2 mb-2 gap-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to registrations
          </Button>
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Focused registration
        </p>
        <h2 className="mt-1 text-xl font-bold">{registration.exhibitorName}</h2>
        <p className="text-sm text-muted-foreground">
          {registration.confirmationNumber
            ? formatConfirmationNumberLabel(registration.confirmationNumber)
            : 'No confirmation number'}{' '}
          · {registration.exhibitorEmail || 'No email'}
        </p>
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
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Primary work
          </p>
          <p className="mt-2 font-semibold">{registration.recommendedAction.label}</p>
          <p className="text-sm text-muted-foreground">
            {registration.recommendedAction.affectedEntryIds.length} of {registration.entryCount}{' '}
            {registration.entryCount === 1 ? 'Entry' : 'Entries'} currently{' '}
            {registration.recommendedAction.affectedEntryIds.length === 1 ? 'needs' : 'need'} this
            action.
          </p>
        </div>

        <EnrollmentCard group={registration} {...enrollmentCardProps} />
      </div>
    </section>
  );
}
