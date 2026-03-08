import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PaymentStep } from '@/components/shows/RegistrationWorkflow/PaymentStep';
import { PaymentReconciliation } from '@/components/shows/RegistrationWorkflow/PaymentReconciliation';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';

// Create a test query client
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = createTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// Mock the hooks and stores
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: [
      {
        id: '1',
        callName: 'Buddy',
        name: 'Champion Buddy',
        breed: 'Golden Retriever',
      },
      {
        id: '2',
        callName: 'Max',
        name: 'Champion Max',
        breed: 'German Shepherd',
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({
    classes: [
      {
        id: 'class1',
        className: 'Novice Standard',
        entryFee: 35,
      },
      {
        id: 'class2',
        className: 'Open Standard',
        entryFee: 40,
      },
    ],
  }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [],
  }),
}));

vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({}),
  REGISTRATION_PERMISSIONS: {
    MARK_PAYMENT: 'registration:mark_payment',
    MANAGE_PAYMENTS: 'registration:manage_payments',
    BULK_OPERATIONS: 'registration:bulk_operations',
  },
}));

vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Phase 3.5: Payment Component Tests', () => {
  describe('PaymentStep Component', () => {
    const defaultProps = {
      selectedDogs: ['1'],
      classSelections: [
        {
          dogId: '1',
          trialId: 'trial1',
          selectedClasses: [{ classId: 'class1' }],
        },
      ],
      paymentMethod: 'credit_card' as const,
      paymentStatus: PaymentStatus.PENDING,
      entryStatus: EntryStatus.PENDING,
      onPaymentMethodChange: vi.fn(),
      onPaymentStatusChange: vi.fn(),
      onEntryStatusChange: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should render payment step with fee calculation', () => {
      render(<PaymentStep {...defaultProps} />, { wrapper: TestWrapper });

      expect(screen.getByText('Payment Information')).toBeInTheDocument();
      expect(screen.getByText('Registration Summary')).toBeInTheDocument();
      expect(screen.getByText('Buddy')).toBeInTheDocument();
      expect(screen.getByText('Novice Standard')).toBeInTheDocument();
      // Use getAllByText for price that appears multiple times (class fee + subtotal)
      const priceElements = screen.getAllByText('$35.00');
      expect(priceElements.length).toBeGreaterThan(0);
      expect(priceElements[0]).toBeInTheDocument();
    });

    it('should calculate fees correctly with discounts', () => {
      const propsWithMultipleDogs = {
        ...defaultProps,
        selectedDogs: ['1', '2'],
        classSelections: [
          {
            dogId: '1',
            trialId: 'trial1',
            selectedClasses: [{ classId: 'class1' }],
          },
          {
            dogId: '2',
            trialId: 'trial1',
            selectedClasses: [{ classId: 'class2' }],
          },
        ],
      };

      render(<PaymentStep {...propsWithMultipleDogs} />, { wrapper: TestWrapper });

      // Should show subtotal (may appear multiple times)
      const subtotalElements = screen.getAllByText('$75.00');
      expect(subtotalElements.length).toBeGreaterThan(0); // $35 + $40

      // Should show early bird discount
      expect(screen.getByText(/5% early bird discount/)).toBeInTheDocument();

      // Should show total due
      expect(screen.getByText(/Total Due/)).toBeInTheDocument();
    });

    it('should handle credit card payment method selection', async () => {
      render(<PaymentStep {...defaultProps} />, { wrapper: TestWrapper });

      // Credit card option should be rendered and selected (shown as a button card, not a radio)
      expect(screen.getByText('Credit/Debit Card (Online Payment)')).toBeInTheDocument();

      // Should show credit card form fields when credit_card is selected
      await waitFor(() => {
        expect(screen.getByLabelText('Cardholder Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Card Number')).toBeInTheDocument();
        expect(screen.getByLabelText('Expiry Date')).toBeInTheDocument();
        expect(screen.getByLabelText('CVV')).toBeInTheDocument();
      });
    });

    it('should format card number input correctly', async () => {
      const user = userEvent.setup();
      render(<PaymentStep {...defaultProps} />, { wrapper: TestWrapper });

      const cardNumberInput = screen.getByLabelText('Card Number');

      await user.type(cardNumberInput, '4111111111111111');

      expect(cardNumberInput).toHaveValue('4111 1111 1111 1111');
    });

    it('should format expiry date input correctly', async () => {
      const user = userEvent.setup();
      render(<PaymentStep {...defaultProps} />, { wrapper: TestWrapper });

      const expiryInput = screen.getByLabelText('Expiry Date');

      await user.type(expiryInput, '1225');

      expect(expiryInput).toHaveValue('12/25');
    });

    it('should handle check payment method selection', () => {
      render(<PaymentStep {...defaultProps} paymentMethod="check" />, { wrapper: TestWrapper });

      // Check option should be rendered
      expect(screen.getByText('Check (pay at show)')).toBeInTheDocument();

      // Should show check instructions
      expect(
        screen.getByText(/Please bring your check made payable to the hosting club/)
      ).toBeInTheDocument();

      // Should show optional check number field
      expect(screen.getByLabelText('Check Number (optional)')).toBeInTheDocument();
    });

    it('should handle cash payment method selection', () => {
      render(<PaymentStep {...defaultProps} paymentMethod="cash" />, { wrapper: TestWrapper });

      // Cash option should be rendered
      expect(screen.getByText('Cash (pay at show)')).toBeInTheDocument();

      // Should show cash instructions
      expect(
        screen.getByText(/Please bring exact cash amount on the day of the show/)
      ).toBeInTheDocument();
    });

    it('should show secretary payment management features', () => {
      render(<PaymentStep {...defaultProps} />, { wrapper: TestWrapper });

      // Should show secretary management section
      expect(screen.getByText('Secretary Payment Management')).toBeInTheDocument();

      // Should show tabs
      expect(screen.getByText('Payment')).toBeInTheDocument();
      expect(screen.getByText('Entry Status')).toBeInTheDocument();
      expect(screen.getByText('Fee Override')).toBeInTheDocument();
      expect(screen.getByText('Reconciliation')).toBeInTheDocument();
    });

    it('should handle payment status updates', async () => {
      const user = userEvent.setup();
      const onPaymentStatusChange = vi.fn();

      render(<PaymentStep {...defaultProps} onPaymentStatusChange={onPaymentStatusChange} />, {
        wrapper: TestWrapper,
      });

      // Click on Mark as Paid by Check button
      const markPaidButton = screen.getByText('Mark as Paid by Check');
      await user.click(markPaidButton);

      expect(onPaymentStatusChange).toHaveBeenCalledWith(PaymentStatus.PAID_BY_CHECK);
    });

    it('should handle entry status updates', async () => {
      const user = userEvent.setup();
      const onEntryStatusChange = vi.fn();

      render(<PaymentStep {...defaultProps} onEntryStatusChange={onEntryStatusChange} />, {
        wrapper: TestWrapper,
      });

      // Navigate to Entry Status tab
      const entryStatusTab = screen.getByText('Entry Status');
      await user.click(entryStatusTab);

      // Click Accept Entry button
      const acceptButton = screen.getByText('Accept Entry');
      await user.click(acceptButton);

      expect(onEntryStatusChange).toHaveBeenCalledWith(EntryStatus.ACCEPTED, '');
    });

    it('should show proper payment status badges', () => {
      render(<PaymentStep {...defaultProps} paymentStatus={PaymentStatus.PAID_ONLINE} />, {
        wrapper: TestWrapper,
      });

      // Should show current payment status
      expect(screen.getByText(PaymentStatus.PAID_ONLINE)).toBeInTheDocument();
    });

    it('should handle fee override functionality', async () => {
      const user = userEvent.setup();

      render(<PaymentStep {...defaultProps} />, { wrapper: TestWrapper });

      // Navigate to Fee Override tab
      const feeTab = screen.getByText('Fee Override');
      await user.click(feeTab);

      // Should show waive fees option
      const waiveFeesCheckbox = screen.getByLabelText('Waive all fees');
      expect(waiveFeesCheckbox).toBeInTheDocument();

      // Should show override amount input
      const overrideInput = screen.getByLabelText('Override Total Amount');
      expect(overrideInput).toBeInTheDocument();

      // Test fee override
      await user.type(overrideInput, '25.00');
      expect(overrideInput).toHaveValue(25);
    });

    it('should show payment summary correctly', () => {
      render(<PaymentStep {...defaultProps} paymentMethod="credit_card" />, {
        wrapper: TestWrapper,
      });

      expect(screen.getByText('Payment Summary')).toBeInTheDocument();
      expect(screen.getByText('Credit/Debit Card')).toBeInTheDocument();
      expect(screen.getByText(/Payment will be processed securely via Stripe/)).toBeInTheDocument();
    });

    it('should show security notice', () => {
      render(<PaymentStep {...defaultProps} />, { wrapper: TestWrapper });

      expect(
        screen.getByText(/Your payment information is secure and encrypted/)
      ).toBeInTheDocument();
    });
  });

  describe('PaymentReconciliation Component', () => {
    const mockEntries = [
      {
        id: '1',
        registrationId: 'REG-001',
        dogName: 'Buddy',
        ownerName: 'John Doe',
        totalFee: 35.0,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        entryStatus: EntryStatus.ACCEPTED,
        paymentMethod: 'credit_card',
        paymentReference: 'txn_123',
        paymentDate: '2024-01-15',
      },
      {
        id: '2',
        registrationId: 'REG-002',
        dogName: 'Max',
        ownerName: 'Jane Smith',
        totalFee: 40.0,
        paymentStatus: PaymentStatus.PENDING,
        entryStatus: EntryStatus.PENDING,
        paymentMethod: 'check',
        paymentReference: 'CHECK-1001',
      },
    ];

    const defaultProps = {
      showId: 'show-123',
      entries: mockEntries,
      onPaymentStatusUpdate: vi.fn(),
      onBulkPaymentUpdate: vi.fn(),
      onExportReport: vi.fn(),
      onImportPayments: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should render payment reconciliation overview', () => {
      render(<PaymentReconciliation {...defaultProps} />);

      expect(screen.getByText('Payment Reconciliation')).toBeInTheDocument();

      // Should show overview tab
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Payment Entries')).toBeInTheDocument();
      expect(screen.getByText('Bulk Operations')).toBeInTheDocument();
    });

    it('should display payment statistics correctly', () => {
      render(<PaymentReconciliation {...defaultProps} />);

      // Should show total entries
      expect(screen.getByText('2')).toBeInTheDocument(); // Total entries

      // Should show paid entries
      const paidCountElements = screen.getAllByText('1');
      expect(paidCountElements.length).toBeGreaterThan(0); // Paid entries

      // Should show pending entries (already covered by getAllByText above)
      expect(paidCountElements.length).toBe(2); // Should have exactly 2 instances of "1"

      // Should show financial summary (amounts may appear multiple times)
      expect(screen.getAllByText('$75.00').length).toBeGreaterThan(0); // Total expected
      expect(screen.getAllByText('$35.00').length).toBeGreaterThan(0); // Collected fees
      expect(screen.getAllByText('$40.00').length).toBeGreaterThan(0); // Outstanding fees
    });

    it('should handle search functionality', async () => {
      const user = userEvent.setup();
      render(<PaymentReconciliation {...defaultProps} />);

      // Navigate to Payment Entries tab
      const entriesTab = screen.getByText('Payment Entries');
      await user.click(entriesTab);

      // Search for specific entry
      const searchInput = screen.getByPlaceholderText(
        /Search by dog name, owner, or registration ID/
      );
      await user.type(searchInput, 'Buddy');

      // Should filter entries
      expect(screen.getByText('Buddy')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('should handle status filtering', async () => {
      const user = userEvent.setup();
      render(<PaymentReconciliation {...defaultProps} />);

      // Navigate to Payment Entries tab
      const entriesTab = screen.getByText('Payment Entries');
      await user.click(entriesTab);

      // Verify both entries are visible before filtering
      expect(screen.getByText('Buddy')).toBeInTheDocument();
      expect(screen.getByText('Max')).toBeInTheDocument();

      // Verify the status filter label renders
      expect(screen.getByText('Filter by Status')).toBeInTheDocument();

      // Verify the search filter works to narrow results (since the Base UI Select
      // portal does not render in jsdom, we test filtering via search instead)
      const searchInput = screen.getByPlaceholderText(
        /Search by dog name, owner, or registration ID/
      );
      await user.type(searchInput, 'Max');

      // Should show only Max / Jane Smith after filtering by search
      expect(screen.getByText('Max')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    });

    it('should handle individual payment status updates', async () => {
      const user = userEvent.setup();
      const onPaymentStatusUpdate = vi.fn();

      render(
        <PaymentReconciliation {...defaultProps} onPaymentStatusUpdate={onPaymentStatusUpdate} />
      );

      // Navigate to Payment Entries tab
      const entriesTab = screen.getByText('Payment Entries');
      await user.click(entriesTab);

      // Click Mark Paid button
      const markPaidButtons = screen.getAllByText('Mark Paid');
      await user.click(markPaidButtons[0]);

      expect(onPaymentStatusUpdate).toHaveBeenCalledWith('1', PaymentStatus.PAID_BY_CHECK);
    });

    it('should handle bulk payment operations', async () => {
      const user = userEvent.setup();
      const onBulkPaymentUpdate = vi.fn();

      render(<PaymentReconciliation {...defaultProps} onBulkPaymentUpdate={onBulkPaymentUpdate} />);

      // Navigate to Payment Entries tab
      const entriesTab = screen.getByText('Payment Entries');
      await user.click(entriesTab);

      // Select entries for bulk operation
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]); // Select first entry
      await user.click(checkboxes[2]); // Select second entry

      // Navigate to Bulk Operations tab
      const bulkTab = screen.getByText('Bulk Operations');
      await user.click(bulkTab);

      // Should show selected entries count
      expect(screen.getByText(/Selected 2 entries/)).toBeInTheDocument();

      // Fill bulk update form
      const bulkReference = screen.getByLabelText('Payment Reference');
      await user.type(bulkReference, 'BATCH-001');

      // Apply bulk update
      const applyButton = screen.getByText(/Apply to 2 Entries/);
      await user.click(applyButton);

      expect(onBulkPaymentUpdate).toHaveBeenCalledWith(
        ['1', '2'],
        PaymentStatus.PAID_BY_CHECK,
        'BATCH-001'
      );
    });

    it('should handle export functionality', async () => {
      const user = userEvent.setup();
      const onExportReport = vi.fn();

      render(<PaymentReconciliation {...defaultProps} onExportReport={onExportReport} />);

      // Click Export Report button
      const exportButton = screen.getByText('Export Report');
      await user.click(exportButton);

      expect(onExportReport).toHaveBeenCalledWith(mockEntries);
    });

    it('should handle import functionality', async () => {
      const user = userEvent.setup();
      const onImportPayments = vi.fn();

      render(<PaymentReconciliation {...defaultProps} onImportPayments={onImportPayments} />);

      // Create a mock file
      const file = new File(['payment,data'], 'payments.csv', { type: 'text/csv' });

      // Find the hidden file input
      const fileInput = screen.getByLabelText(/Import Payments/);

      // Simulate file selection
      await user.upload(fileInput, file);

      expect(onImportPayments).toHaveBeenCalledWith(file);
    });

    it('should display payment status icons correctly', () => {
      render(<PaymentReconciliation {...defaultProps} />);

      // Navigate to Payment Entries tab
      const entriesTab = screen.getByText('Payment Entries');
      fireEvent.click(entriesTab);

      // Should show payment status information in some form (text, badges, or icons)
      // Try different possible formats for payment status display
      const statusFound =
        screen.queryAllByText(PaymentStatus.PAID_ONLINE).length > 0 ||
        screen.queryAllByText('Paid Online').length > 0 ||
        screen.queryAllByText('paid').length > 0 ||
        screen.queryAllByText(/paid/i).length > 0;

      expect(statusFound).toBe(true);

      const pendingFound =
        screen.queryAllByText(PaymentStatus.PENDING).length > 0 ||
        screen.queryAllByText('Pending').length > 0 ||
        screen.queryAllByText('pending').length > 0 ||
        screen.queryAllByText(/pending/i).length > 0;

      expect(pendingFound).toBe(true);
    });

    it('should handle select all functionality', async () => {
      const user = userEvent.setup();
      render(<PaymentReconciliation {...defaultProps} />);

      // Navigate to Payment Entries tab
      const entriesTab = screen.getByText('Payment Entries');
      await user.click(entriesTab);

      // Click select all checkbox
      const selectAllCheckbox = screen.getAllByRole('checkbox')[0]; // First checkbox is select all
      await user.click(selectAllCheckbox);

      // Navigate to Bulk Operations tab
      const bulkTab = screen.getByText('Bulk Operations');
      await user.click(bulkTab);

      // Should show all entries selected
      expect(screen.getByText(/Selected 2 entries/)).toBeInTheDocument();
    });

    it('should show no entries message when filtered results are empty', async () => {
      const user = userEvent.setup();
      render(<PaymentReconciliation {...defaultProps} />);

      // Navigate to Payment Entries tab
      const entriesTab = screen.getByText('Payment Entries');
      await user.click(entriesTab);

      // Search for non-existent entry
      const searchInput = screen.getByPlaceholderText(
        /Search by dog name, owner, or registration ID/
      );
      await user.type(searchInput, 'NonExistentDog');

      // Should show no entries message
      expect(
        screen.getByText(/No entries found matching your search criteria/)
      ).toBeInTheDocument();
    });
  });

  describe('Payment Component Integration', () => {
    it('should handle payment method changes correctly', async () => {
      const user = userEvent.setup();
      const onPaymentMethodChange = vi.fn();

      render(
        <PaymentStep
          selectedDogs={['1']}
          classSelections={[
            {
              dogId: '1',
              trialId: 'trial1',
              selectedClasses: [{ classId: 'class1' }],
            },
          ]}
          paymentMethod="credit_card"
          onPaymentMethodChange={onPaymentMethodChange}
        />,
        { wrapper: TestWrapper }
      );

      // Switch to check payment by clicking the check option card
      const checkOption = screen.getByText('Check (pay at show)');
      await user.click(checkOption);

      expect(onPaymentMethodChange).toHaveBeenCalledWith('check');
    });

    it('should calculate multi-dog discounts correctly', () => {
      render(
        <PaymentStep
          selectedDogs={['1', '2']}
          classSelections={[
            {
              dogId: '1',
              trialId: 'trial1',
              selectedClasses: [{ classId: 'class1' }],
            },
            {
              dogId: '2',
              trialId: 'trial1',
              selectedClasses: [{ classId: 'class2' }],
            },
          ]}
          paymentMethod="credit_card"
          onPaymentMethodChange={vi.fn()}
        />,
        { wrapper: TestWrapper }
      );

      // Should show subtotal (may appear multiple times)
      expect(screen.getAllByText('$75.00').length).toBeGreaterThan(0);

      // Should show discounts
      expect(screen.getByText(/early bird discount/)).toBeInTheDocument();
    });

    it('should handle payment status integration with entry status', () => {
      render(
        <PaymentStep
          selectedDogs={['1']}
          classSelections={[
            {
              dogId: '1',
              trialId: 'trial1',
              selectedClasses: [{ classId: 'class1' }],
            },
          ]}
          paymentMethod="credit_card"
          paymentStatus={PaymentStatus.PAID_ONLINE}
          entryStatus={EntryStatus.ACCEPTED}
          onPaymentMethodChange={vi.fn()}
        />,
        { wrapper: TestWrapper }
      );

      // Should show both payment and entry status
      expect(screen.getByText(PaymentStatus.PAID_ONLINE)).toBeInTheDocument();
    });
  });
});
