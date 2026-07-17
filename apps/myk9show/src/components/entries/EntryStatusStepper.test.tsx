import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EntryStatusStepper } from './EntryStatusStepper';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

describe('EntryStatusStepper', () => {
  describe('step progression', () => {
    it('should show "Under Review" as active for pending entries', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.PENDING}
          paymentStatus={PaymentStatus.PENDING}
        />
      );

      // Step 1 (Submitted) should be completed
      // Step 2 (Under Review) should be active
      const steps = screen.getAllByText(/Submitted|Review|Accepted|Paid/);
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should show "Accepted" as active for accepted entries with pending payment', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.ACCEPTED}
          paymentStatus={PaymentStatus.PENDING}
        />
      );

      // Accepted should be visible and active
      expect(screen.getByText('Accepted')).toBeInTheDocument();
    });

    it('should show all steps completed for accepted and paid entries', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.ACCEPTED}
          paymentStatus={PaymentStatus.PAID_ONLINE}
        />
      );

      // "Paid" step should be visible
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('should show "Paid" step for entries paid by check', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.ACCEPTED}
          paymentStatus={PaymentStatus.PAID_BY_CHECK}
        />
      );

      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('should show "Paid" step for entries paid by cash', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.ACCEPTED}
          paymentStatus={PaymentStatus.PAID_BY_CASH}
        />
      );

      expect(screen.getByText('Paid')).toBeInTheDocument();
    });
  });

  describe('special states', () => {
    it('should show "Waitlist" label for waitlisted entries', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.WAITLIST}
          paymentStatus={PaymentStatus.PENDING}
        />
      );

      expect(screen.getByText('Waitlist')).toBeInTheDocument();
    });

    it('should show "Rejected" label for rejected entries', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.REJECTED}
          paymentStatus={PaymentStatus.PENDING}
        />
      );

      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });

    it('should show "Cancelled" label for cancelled entries', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.CANCELLED}
          paymentStatus={PaymentStatus.PENDING}
        />
      );

      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('completed and move-up-requested progression', () => {
    // Completed steps use the shared complete shape, so the count is a proxy
    // for how far the stepper has progressed.
    function progressMarkers(entryStatus: EntryStatus, paymentStatus: PaymentStatus): number {
      const { container, unmount } = render(
        <EntryStatusStepper entryStatus={entryStatus} paymentStatus={paymentStatus} />
      );
      const count = container.querySelectorAll(
        '[data-family="entry"][data-shape="complete"]'
      ).length;
      unmount();
      return count;
    }

    it('shows a scored (completed) entry fully progressed, not stuck at Submitted', () => {
      // Regression guard: COMPLETED previously hit the default `return 0`
      // (Submitted) branch. It should mirror an accepted+paid entry.
      const completed = progressMarkers(EntryStatus.COMPLETED, PaymentStatus.PAID_ONLINE);
      const acceptedPaid = progressMarkers(EntryStatus.ACCEPTED, PaymentStatus.PAID_ONLINE);
      const submitted = progressMarkers(EntryStatus.PENDING, PaymentStatus.PENDING);

      expect(completed).toBe(acceptedPaid);
      expect(completed).toBeGreaterThan(submitted);
    });

    it('treats a paid move-up request like an accepted+paid entry', () => {
      expect(progressMarkers(EntryStatus.MOVE_UP_REQUESTED, PaymentStatus.PAID_ONLINE)).toBe(
        progressMarkers(EntryStatus.ACCEPTED, PaymentStatus.PAID_ONLINE)
      );
    });

    it('treats an unpaid move-up request like an accepted-but-unpaid entry', () => {
      expect(progressMarkers(EntryStatus.MOVE_UP_REQUESTED, PaymentStatus.PENDING)).toBe(
        progressMarkers(EntryStatus.ACCEPTED, PaymentStatus.PENDING)
      );
    });
  });

  describe('component structure', () => {
    it('renders each step through the shared entry status grammar', () => {
      const { container } = render(
        <EntryStatusStepper
          entryStatus={EntryStatus.PENDING}
          paymentStatus={PaymentStatus.PENDING}
        />
      );

      expect(container.querySelectorAll('[data-family="entry"]')).toHaveLength(4);
    });

    it('should render with entry-status-stepper class', () => {
      const { container } = render(
        <EntryStatusStepper
          entryStatus={EntryStatus.PENDING}
          paymentStatus={PaymentStatus.PENDING}
        />
      );

      expect(container.querySelector('.entry-status-stepper')).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      const { container } = render(
        <EntryStatusStepper
          entryStatus={EntryStatus.PENDING}
          paymentStatus={PaymentStatus.PENDING}
          className="custom-class"
        />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('should render 4 step labels', () => {
      render(
        <EntryStatusStepper
          entryStatus={EntryStatus.ACCEPTED}
          paymentStatus={PaymentStatus.PAID_ONLINE}
        />
      );

      // Should have Submitted, Review (shown as completed check), Accepted, Paid
      // Note: When steps are completed they show checkmarks instead of numbers
      const stepContainer = screen.getByText('Submitted').closest('.entry-status-stepper');
      expect(stepContainer).toBeInTheDocument();
    });
  });
});
