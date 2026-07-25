import React from 'react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { cn } from '@/lib/utils';
import { StatusIcon } from '@/components/status';

interface EntryStatusStepperProps {
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  className?: string;
}

interface Step {
  key: string;
  label: string;
  shortLabel: string;
}

const steps: Step[] = [
  { key: 'submitted', label: 'Submitted', shortLabel: 'Submitted' },
  { key: 'review', label: 'Under Review', shortLabel: 'Review' },
  { key: 'accepted', label: 'Accepted', shortLabel: 'Accepted' },
  { key: 'paid', label: 'Payment Complete', shortLabel: 'Paid' },
];

function getActiveStep(entryStatus: EntryStatus, paymentStatus: PaymentStatus): number {
  // Rejected or cancelled - show at step 2 (review) with error state
  if (entryStatus === EntryStatus.REJECTED || entryStatus === EntryStatus.CANCELLED) {
    return 1; // Stuck at review
  }

  // Waitlist - between review and accepted
  if (entryStatus === EntryStatus.WAITLIST) {
    return 1; // At review stage
  }

  // Completed (scored) - the registration lifecycle is fully past; show every
  // step done rather than collapsing to the "Submitted" default.
  if (entryStatus === EntryStatus.COMPLETED) {
    return 3;
  }

  // Accepted (or accepted-with-pending-move-up) and paid. A move-up request is
  // a confirmed entry awaiting a separate approval, so its registration
  // lifecycle mirrors ACCEPTED.
  if (entryStatus === EntryStatus.ACCEPTED || entryStatus === EntryStatus.MOVE_UP_REQUESTED) {
    const isPaid =
      paymentStatus === PaymentStatus.PAID_ONLINE ||
      paymentStatus === PaymentStatus.PAID_BY_CHECK ||
      paymentStatus === PaymentStatus.PAID_BY_CASH;
    return isPaid ? 3 : 2; // Step 3 (paid) or Step 2 (accepted)
  }

  // Pending - at review stage
  if (entryStatus === EntryStatus.PENDING) {
    return 1;
  }

  // Default - submitted
  return 0;
}

function isStepCompleted(stepIndex: number, activeStep: number): boolean {
  return stepIndex < activeStep;
}

function isStepActive(stepIndex: number, activeStep: number): boolean {
  return stepIndex === activeStep;
}

export const EntryStatusStepper: React.FC<EntryStatusStepperProps> = ({
  entryStatus,
  paymentStatus,
  className,
}) => {
  const activeStep = getActiveStep(entryStatus, paymentStatus);
  const isRejected = entryStatus === EntryStatus.REJECTED;
  const isCancelled = entryStatus === EntryStatus.CANCELLED;
  const isWaitlist = entryStatus === EntryStatus.WAITLIST;
  const hasError = isRejected || isCancelled;

  return (
    <div className={cn('entry-status-stepper', className)}>
      <div className="flex items-center justify-between w-full">
        {steps.map((step, index) => {
          const completed = isStepCompleted(index, activeStep);
          const active = isStepActive(index, activeStep);
          const isLastStep = index === steps.length - 1;
          const indicatorStatus = completed
            ? 'completed'
            : active && (hasError || isWaitlist)
              ? entryStatus
              : active
                ? 'in-progress'
                : 'no-status';

          return (
            <React.Fragment key={step.key}>
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 items-center justify-center">
                  <StatusIcon
                    family="entry"
                    status={indicatorStatus}
                    size="lg"
                    decorative
                  />
                </div>
                <span
                  className={cn(
                    'mt-1.5 text-center text-xs font-medium leading-tight',
                    active ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {/* Show special label for waitlist/rejected */}
                  {active && isWaitlist
                    ? 'Waitlist'
                    : active && isRejected
                      ? 'Rejected'
                      : active && isCancelled
                        ? 'Cancelled'
                        : step.shortLabel}
                </span>
              </div>

              {/* Connector line */}
              {!isLastStep && (
                <div className="mx-1.5 h-0.5 flex-1 bg-border transition-all duration-300" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default EntryStatusStepper;
