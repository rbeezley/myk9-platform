import { ConfirmDialog } from '@/components/ui/alert-dialog/confirm-dialog';
import type { LedgerConfirmKind, LedgerConfirmState } from './enrollmentPayment';

const COPY: Record<
  LedgerConfirmKind,
  { title: string; description: string; confirmLabel: string; destructive: boolean }
> = {
  'paid-online': {
    title: 'Mark Paid in Full Online?',
    description:
      'This marks the entry form as paid online. Use it only when the card payment went through.',
    confirmLabel: 'Mark Paid Online',
    destructive: false,
  },
  'payment-due': {
    title: 'Mark Payment Due?',
    description: 'This marks the whole entry form as unpaid.',
    confirmLabel: 'Mark as Unpaid',
    destructive: true,
  },
};

interface EnrollmentLedgerConfirmDialogProps {
  state: LedgerConfirmState;
  onClose: () => void;
  onConfirm: () => void;
}

/** One question before "Paid in Full: Online" or "Payment Due" changes what the form owes. */
export function EnrollmentLedgerConfirmDialog({
  state,
  onClose,
  onConfirm,
}: EnrollmentLedgerConfirmDialogProps) {
  const copy = COPY[state.kind];
  return (
    <ConfirmDialog
      open={state.open}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      destructive={copy.destructive}
      onConfirm={onConfirm}
    />
  );
}
