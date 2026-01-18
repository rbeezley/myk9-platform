import React from 'react';
import { Check } from 'lucide-react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { cn } from '@/lib/utils';

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

  // Accepted and paid
  if (entryStatus === EntryStatus.ACCEPTED) {
    const isPaid = paymentStatus === PaymentStatus.PAID_ONLINE ||
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

          return (
            <React.Fragment key={step.key}>
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300',
                    completed && 'bg-success-green text-white',
                    active && !hasError && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                    active && hasError && 'bg-error-red text-white ring-2 ring-error-red/30',
                    active && isWaitlist && 'bg-warning-orange text-white ring-2 ring-warning-orange/30',
                    !completed && !active && 'bg-muted text-muted-foreground'
                  )}
                >
                  {completed ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'mt-1.5 text-[10px] font-medium text-center leading-tight',
                    completed && 'text-success-green',
                    active && !hasError && 'text-primary',
                    active && hasError && 'text-error-red',
                    active && isWaitlist && 'text-warning-orange',
                    !completed && !active && 'text-muted-foreground'
                  )}
                >
                  {/* Show special label for waitlist/rejected */}
                  {active && isWaitlist ? 'Waitlist' : active && isRejected ? 'Rejected' : active && isCancelled ? 'Cancelled' : step.shortLabel}
                </span>
              </div>

              {/* Connector line */}
              {!isLastStep && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-1.5 transition-all duration-300',
                    completed ? 'bg-success-green' : 'bg-muted'
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default EntryStatusStepper;
