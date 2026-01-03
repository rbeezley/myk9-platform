import { test, expect, Page } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Phase 3.5: Comprehensive Payment Processing', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
    await testSetup.setupPaymentMocks();
  });

  test.describe('Credit Card Processing', () => {
    test('should process successful credit card payment with security validation', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      
      // Complete entry selection
      await completeEntrySelection(page);
      
      // Navigate to payment step
      await page.click('[data-testid="next-step-button"]');
      await expect(page.locator('[data-testid="payment-step"]')).toBeVisible();
      
      // Verify fee calculation
      await expect(page.locator('[data-testid="entry-fee"]')).toContainText('$35.00');
      await expect(page.locator('[data-testid="processing-fee"]')).toContainText('$1.75');
      await expect(page.locator('[data-testid="total-amount"]')).toContainText('$36.75');
      
      // Select credit card payment
      await page.click('[data-testid="payment-method-credit-card"]');
      
      // Fill credit card information with validation
      await page.fill('[data-testid="cardholder-name-input"]', 'John Doe');
      await page.fill('[data-testid="card-number-input"]', '4111111111111111');
      await page.fill('[data-testid="expiry-input"]', '12/25');
      await page.fill('[data-testid="cvv-input"]', '123');
      
      // Fill billing address
      await page.fill('[data-testid="billing-street-input"]', '123 Main Street');
      await page.fill('[data-testid="billing-city-input"]', 'Springfield');
      await page.selectOption('[data-testid="billing-state-select"]', 'IL');
      await page.fill('[data-testid="billing-zip-input"]', '62701');
      
      // Verify card validation feedback
      await expect(page.locator('[data-testid="card-validation-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="security-indicators"]')).toContainText('Secure');
      
      // Accept payment terms
      await page.check('[data-testid="payment-terms-checkbox"]');
      
      // Process payment
      await page.click('[data-testid="process-payment-button"]');
      
      // Verify payment processing
      await expect(page.locator('[data-testid="payment-processing"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-processing-message"]')).toContainText('Processing your payment securely');
      
      // Wait for payment completion
      await expect(page.locator('[data-testid="payment-success"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="transaction-id"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-confirmation-email"]')).toContainText('sent to');
      
      // Verify entry status updated
      await expect(page.locator('[data-testid="entry-status-accepted"]')).toBeVisible();
    });

    test('should handle credit card validation errors', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      await completeEntrySelection(page);
      await page.click('[data-testid="next-step-button"]');
      
      await page.click('[data-testid="payment-method-credit-card"]');
      
      // Test invalid card number
      await page.fill('[data-testid="card-number-input"]', '1234567890123456');
      await page.blur('[data-testid="card-number-input"]');
      await expect(page.locator('[data-testid="card-number-error"]')).toContainText('Invalid card number');
      
      // Test expired card
      await page.fill('[data-testid="card-number-input"]', '4111111111111111');
      await page.fill('[data-testid="expiry-input"]', '01/20');
      await page.blur('[data-testid="expiry-input"]');
      await expect(page.locator('[data-testid="expiry-error"]')).toContainText('Card has expired');
      
      // Test invalid CVV
      await page.fill('[data-testid="expiry-input"]', '12/25');
      await page.fill('[data-testid="cvv-input"]', '12');
      await page.blur('[data-testid="cvv-input"]');
      await expect(page.locator('[data-testid="cvv-error"]')).toContainText('Invalid CVV');
      
      // Test missing required fields
      await page.fill('[data-testid="cvv-input"]', '123');
      await page.click('[data-testid="process-payment-button"]');
      await expect(page.locator('[data-testid="billing-address-error"]')).toBeVisible();
    });

    test('should handle declined credit card payments with recovery options', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      await completeEntrySelection(page);
      await page.click('[data-testid="next-step-button"]');
      
      await page.click('[data-testid="payment-method-credit-card"]');
      
      // Use declined test card
      await fillValidCreditCardForm(page, '4000000000000002'); // Declined card
      
      await page.click('[data-testid="process-payment-button"]');
      
      // Verify decline handling
      await expect(page.locator('[data-testid="payment-declined"]')).toBeVisible();
      await expect(page.locator('[data-testid="decline-message"]')).toContainText('Your card was declined');
      
      // Verify recovery options presented
      await expect(page.locator('[data-testid="try-different-card-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="alternative-payment-methods"]')).toBeVisible();
      await expect(page.locator('[data-testid="contact-bank-suggestion"]')).toBeVisible();
      
      // Try alternative payment method
      await page.click('[data-testid="use-paypal-button"]');
      await expect(page.locator('[data-testid="paypal-checkout"]')).toBeVisible();
    });

    test('should handle 3DS authentication flow', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      await completeEntrySelection(page);
      await page.click('[data-testid="next-step-button"]');
      
      await page.click('[data-testid="payment-method-credit-card"]');
      
      // Use 3DS test card
      await fillValidCreditCardForm(page, '4000000000000119'); // 3DS card
      
      await page.click('[data-testid="process-payment-button"]');
      
      // Verify 3DS challenge
      await expect(page.locator('[data-testid="3ds-authentication"]')).toBeVisible();
      await expect(page.locator('[data-testid="3ds-message"]')).toContainText('Additional authentication required');
      
      // Simulate 3DS completion
      await page.click('[data-testid="complete-3ds-button"]');
      
      // Verify successful payment after 3DS
      await expect(page.locator('[data-testid="payment-success"]')).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Check Payment Processing', () => {
    test('should process check payment with tracking', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      await completeEntrySelection(page);
      await page.click('[data-testid="next-step-button"]');
      
      // Select check payment
      await page.click('[data-testid="payment-method-check"]');
      
      // Fill check information
      await page.fill('[data-testid="check-number-input"]', '1001');
      await page.fill('[data-testid="bank-name-input"]', 'First National Bank');
      await page.fill('[data-testid="account-holder-input"]', 'John Doe');
      await page.fill('[data-testid="check-memo-input"]', 'Dog show entry - Buddy');
      
      // Verify payment instructions
      await expect(page.locator('[data-testid="check-payment-instructions"]')).toBeVisible();
      await expect(page.locator('[data-testid="mailing-address"]')).toContainText('Springfield Dog Club');
      await expect(page.locator('[data-testid="payment-deadline"]')).toBeVisible();
      
      // Submit check payment
      await page.click('[data-testid="submit-check-payment-button"]');
      
      // Verify check payment submission
      await expect(page.locator('[data-testid="check-payment-submitted"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-tracking-number"]')).toBeVisible();
      await expect(page.locator('[data-testid="check-payment-status"]')).toContainText('Pending');
      
      // Verify instructions for mailing
      await expect(page.locator('[data-testid="mailing-instructions"]')).toBeVisible();
      await expect(page.locator('[data-testid="postmark-deadline"]')).toBeVisible();
    });

    test('should prevent duplicate check numbers', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      await completeEntrySelection(page);
      await page.click('[data-testid="next-step-button"]');
      
      await page.click('[data-testid="payment-method-check"]');
      
      // Use a check number that's already been used
      await page.fill('[data-testid="check-number-input"]', '999'); // Duplicate check number
      await page.blur('[data-testid="check-number-input"]');
      
      // Verify duplicate warning
      await expect(page.locator('[data-testid="duplicate-check-warning"]')).toBeVisible();
      await expect(page.locator('[data-testid="duplicate-check-warning"]')).toContainText('already been used');
      
      // Button should be disabled
      await expect(page.locator('[data-testid="submit-check-payment-button"]')).toBeDisabled();
      
      // Use different check number
      await page.fill('[data-testid="check-number-input"]', '1002');
      await page.blur('[data-testid="check-number-input"]');
      
      // Warning should disappear
      await expect(page.locator('[data-testid="duplicate-check-warning"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="submit-check-payment-button"]')).toBeEnabled();
    });

    test('should handle check verification workflow', async ({ page }) => {
      // Secretary workflow for check verification
      await testSetup.signIn('secretary');
      await page.goto('/secretary/payment-reconciliation');
      
      // Find pending check payment
      await page.fill('[data-testid="search-input"]', 'CHECK-1001');
      await page.press('[data-testid="search-input"]', 'Enter');
      
      await expect(page.locator('[data-testid="payment-entry-CHECK-1001"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-status-pending"]')).toBeVisible();
      
      // Mark check as received
      await page.click('[data-testid="mark-check-received-button"]');
      
      // Fill check verification details
      await page.fill('[data-testid="received-amount-input"]', '35.00');
      await page.fill('[data-testid="received-date-input"]', '2024-01-15');
      await page.fill('[data-testid="verification-notes-textarea"]', 'Check received and deposited');
      
      await page.click('[data-testid="confirm-check-received-button"]');
      
      // Verify status update
      await expect(page.locator('[data-testid="payment-status-paid"]')).toBeVisible();
      await expect(page.locator('[data-testid="entry-status-accepted"]')).toBeVisible();
    });
  });

  test.describe('Cash Payment Processing', () => {
    test('should handle day-of-show cash payments', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/day-of-show/check-in');
      
      // Find exhibitor checking in
      await page.fill('[data-testid="exhibitor-search"]', 'John Doe');
      await page.click('[data-testid="search-exhibitor-button"]');
      
      await expect(page.locator('[data-testid="exhibitor-john-doe"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-status-pending"]')).toBeVisible();
      
      // Process cash payment
      await page.click('[data-testid="collect-cash-payment-button"]');
      
      // Verify payment details
      await expect(page.locator('[data-testid="cash-amount-due"]')).toContainText('$35.00');
      
      // Record cash received
      await page.fill('[data-testid="cash-received-input"]', '35.00');
      await page.fill('[data-testid="receipt-number-input"]', 'CASH-001');
      
      // Verify exact change
      await expect(page.locator('[data-testid="change-due"]')).toContainText('$0.00');
      
      await page.click('[data-testid="confirm-cash-payment-button"]');
      
      // Verify payment recorded
      await expect(page.locator('[data-testid="cash-payment-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="receipt-generated"]')).toBeVisible();
      await expect(page.locator('[data-testid="entry-status-paid"]')).toBeVisible();
    });

    test('should handle cash overpayment and change', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/day-of-show/check-in');
      
      await page.fill('[data-testid="exhibitor-search"]', 'Jane Smith');
      await page.click('[data-testid="search-exhibitor-button"]');
      
      await page.click('[data-testid="collect-cash-payment-button"]');
      
      // Record overpayment
      await page.fill('[data-testid="cash-received-input"]', '40.00');
      await page.fill('[data-testid="receipt-number-input"]', 'CASH-002');
      
      // Verify change calculation
      await expect(page.locator('[data-testid="change-due"]')).toContainText('$5.00');
      await expect(page.locator('[data-testid="change-alert"]')).toBeVisible();
      
      await page.click('[data-testid="confirm-cash-payment-button"]');
      
      // Verify payment and change recorded
      await expect(page.locator('[data-testid="cash-payment-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="change-given"]')).toContainText('$5.00');
    });

    test('should handle cash tracking and reconciliation', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/cash-reconciliation');
      
      // View cash summary for the day
      await expect(page.locator('[data-testid="cash-receipts-total"]')).toBeVisible();
      await expect(page.locator('[data-testid="cash-transactions-count"]')).toBeVisible();
      
      // Review individual cash transactions
      const transactions = page.locator('[data-testid*="cash-transaction-"]');
      await expect(transactions).toHaveCount(2);
      
      // Verify cash balancing
      await page.click('[data-testid="balance-cash-drawer-button"]');
      
      await page.fill('[data-testid="cash-count-input"]', '75.00');
      await page.click('[data-testid="calculate-variance-button"]');
      
      await expect(page.locator('[data-testid="cash-variance"]')).toContainText('$0.00');
      await expect(page.locator('[data-testid="cash-balanced"]')).toBeVisible();
    });
  });

  test.describe('Refund Processing', () => {
    test('should calculate and process early refunds', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/refund-management');
      
      // Find paid entry to refund
      await page.fill('[data-testid="search-refund-input"]', 'TXN-12345');
      await page.click('[data-testid="search-refund-button"]');
      
      await expect(page.locator('[data-testid="transaction-TXN-12345"]')).toBeVisible();
      await expect(page.locator('[data-testid="original-amount"]')).toContainText('$75.00');
      
      // Initiate refund
      await page.click('[data-testid="initiate-refund-button"]');
      
      // Select refund reason
      await page.selectOption('[data-testid="refund-reason-select"]', 'withdrawal');
      await page.fill('[data-testid="refund-notes-textarea"]', 'Exhibitor unable to attend due to emergency');
      
      // Calculate refund (early - 10 days before show)
      await page.click('[data-testid="calculate-refund-button"]');
      
      await expect(page.locator('[data-testid="refund-calculation"]')).toBeVisible();
      await expect(page.locator('[data-testid="original-payment"]')).toContainText('$75.00');
      await expect(page.locator('[data-testid="processing-fee"]')).toContainText('$1.13'); // 1.5% retained
      await expect(page.locator('[data-testid="cancellation-fee"]')).toContainText('$0.00'); // No fee for early
      await expect(page.locator('[data-testid="net-refund"]')).toContainText('$73.87');
      
      // Process refund
      await page.click('[data-testid="process-refund-button"]');
      await page.click('[data-testid="confirm-refund-button"]');
      
      // Verify refund processing
      await expect(page.locator('[data-testid="refund-processing"]')).toBeVisible();
      await expect(page.locator('[data-testid="refund-confirmation"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="refund-id"]')).toBeVisible();
    });

    test('should calculate and process late refunds with higher fees', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/refund-management');
      
      await page.fill('[data-testid="search-refund-input"]', 'TXN-67890');
      await page.click('[data-testid="search-refund-button"]');
      
      await page.click('[data-testid="initiate-refund-button"]');
      
      await page.selectOption('[data-testid="refund-reason-select"]', 'withdrawal');
      await page.fill('[data-testid="refund-notes-textarea"]', 'Last minute cancellation');
      
      // Calculate refund (late - 1 day before show)
      await page.click('[data-testid="calculate-refund-button"]');
      
      // Verify higher fees for late cancellation
      await expect(page.locator('[data-testid="original-payment"]')).toContainText('$75.00');
      await expect(page.locator('[data-testid="processing-fee"]')).toContainText('$2.25'); // 3% processing fee
      await expect(page.locator('[data-testid="cancellation-fee"]')).toContainText('$18.75'); // 25% late fee
      await expect(page.locator('[data-testid="net-refund"]')).toContainText('$54.00');
      
      // Verify fee explanation
      await expect(page.locator('[data-testid="fee-explanation"]')).toContainText('Late cancellation fee applies');
    });

    test('should handle partial refunds for multi-class entries', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/refund-management');
      
      await page.fill('[data-testid="search-refund-input"]', 'TXN-MULTI-123');
      await page.click('[data-testid="search-refund-button"]');
      
      await expect(page.locator('[data-testid="multi-class-entry"]')).toBeVisible();
      await expect(page.locator('[data-testid="total-classes"]')).toContainText('3 classes');
      await expect(page.locator('[data-testid="total-amount"]')).toContainText('$105.00');
      
      // Select specific classes for refund
      await page.check('[data-testid="refund-class-2-checkbox"]');
      await page.check('[data-testid="refund-class-3-checkbox"]');
      
      await page.click('[data-testid="initiate-partial-refund-button"]');
      
      await page.selectOption('[data-testid="refund-reason-select"]', 'class_cancelled');
      await page.fill('[data-testid="refund-notes-textarea"]', 'Classes 2 and 3 cancelled due to judge unavailability');
      
      // Calculate partial refund
      await page.click('[data-testid="calculate-partial-refund-button"]');
      
      await expect(page.locator('[data-testid="classes-refunded"]')).toContainText('2 classes');
      await expect(page.locator('[data-testid="refund-amount"]')).toContainText('$70.00');
      await expect(page.locator('[data-testid="remaining-classes"]')).toContainText('1 class');
      await expect(page.locator('[data-testid="remaining-balance"]')).toContainText('$35.00');
      
      // Process partial refund
      await page.click('[data-testid="process-partial-refund-button"]');
      
      await expect(page.locator('[data-testid="partial-refund-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="entry-status-partial"]')).toBeVisible();
    });

    test('should handle refund authorization workflow', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/refund-management');
      
      // Large refund requiring approval
      await page.fill('[data-testid="search-refund-input"]', 'TXN-LARGE-500');
      await page.click('[data-testid="search-refund-button"]');
      
      await page.click('[data-testid="initiate-refund-button"]');
      await page.selectOption('[data-testid="refund-reason-select"]', 'error');
      await page.fill('[data-testid="refund-notes-textarea"]', 'Payment processing error - duplicate charge');
      
      await page.click('[data-testid="calculate-refund-button"]');
      
      // Large refund requires approval
      await expect(page.locator('[data-testid="approval-required"]')).toBeVisible();
      await expect(page.locator('[data-testid="approval-message"]')).toContainText('Refunds over $100 require manager approval');
      
      await page.click('[data-testid="request-approval-button"]');
      
      // Verify approval request sent
      await expect(page.locator('[data-testid="approval-requested"]')).toBeVisible();
      await expect(page.locator('[data-testid="approval-status"]')).toContainText('Pending');
      
      // Switch to manager role
      await testSetup.signIn('manager');
      await page.goto('/manager/refund-approvals');
      
      // Approve refund
      await expect(page.locator('[data-testid="pending-approval-TXN-LARGE-500"]')).toBeVisible();
      await page.click('[data-testid="approve-refund-button"]');
      await page.fill('[data-testid="approval-notes"]', 'Approved - confirmed duplicate processing error');
      await page.click('[data-testid="confirm-approval-button"]');
      
      // Verify approval processed
      await expect(page.locator('[data-testid="refund-approved"]')).toBeVisible();
    });
  });

  test.describe('Payment Failure Recovery', () => {
    test('should handle network failures with retry logic', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      await completeEntrySelection(page);
      await page.click('[data-testid="next-step-button"]');
      
      await page.click('[data-testid="payment-method-credit-card"]');
      await fillValidCreditCardForm(page);
      
      // Simulate network failure
      await testSetup.simulateNetworkFailure();
      
      await page.click('[data-testid="process-payment-button"]');
      
      // Verify network error handling
      await expect(page.locator('[data-testid="payment-network-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="retry-payment-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText('Network connection failed');
      
      // Retry payment
      await testSetup.restoreNetwork();
      await page.click('[data-testid="retry-payment-button"]');
      
      // Verify successful retry
      await expect(page.locator('[data-testid="payment-success"]')).toBeVisible({ timeout: 10000 });
    });

    test('should handle insufficient funds with alternative payment options', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      await completeEntrySelection(page);
      await page.click('[data-testid="next-step-button"]');
      
      await page.click('[data-testid="payment-method-credit-card"]');
      
      // Use insufficient funds test card
      await fillValidCreditCardForm(page, '4000000000000341'); // Insufficient funds card
      
      await page.click('[data-testid="process-payment-button"]');
      
      // Verify insufficient funds handling
      await expect(page.locator('[data-testid="payment-insufficient-funds"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText('Insufficient funds');
      
      // Verify alternative payment options
      await expect(page.locator('[data-testid="alternative-payment-options"]')).toBeVisible();
      await expect(page.locator('[data-testid="try-paypal-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="try-different-card-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="pay-by-check-button"]')).toBeVisible();
      
      // Switch to PayPal
      await page.click('[data-testid="try-paypal-button"]');
      await expect(page.locator('[data-testid="paypal-checkout"]')).toBeVisible();
    });

    test('should handle fraud detection alerts', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      await completeEntrySelection(page);
      await page.click('[data-testid="next-step-button"]');
      
      await page.click('[data-testid="payment-method-credit-card"]');
      
      // Use fraud detection test card
      await fillValidCreditCardForm(page, '4100000000000019'); // Fraud detected card
      
      await page.click('[data-testid="process-payment-button"]');
      
      // Verify fraud detection handling
      await expect(page.locator('[data-testid="payment-fraud-detected"]')).toBeVisible();
      await expect(page.locator('[data-testid="fraud-message"]')).toContainText('Transaction flagged for review');
      
      // Verify security instructions
      await expect(page.locator('[data-testid="security-instructions"]')).toBeVisible();
      await expect(page.locator('[data-testid="contact-bank-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="verify-identity-button"]')).toBeVisible();
      
      // No retry option for fraud detection
      await expect(page.locator('[data-testid="retry-payment-button"]')).not.toBeVisible();
    });
  });

  test.describe('Multi-payment and Split Payment Scenarios', () => {
    test('should handle split payment across multiple methods', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/shows/test-show-123/register');
      
      // Select multiple expensive entries
      await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
      await page.click('[data-testid="dog-card-2"] [data-testid="select-dog-button"]');
      await page.click('[data-testid="next-step-button"]');
      
      // Select multiple classes for high total
      await page.check('[data-testid="class-specialty-1-checkbox"]'); // $75
      await page.check('[data-testid="class-specialty-2-checkbox"]'); // $75
      await page.click('[data-testid="next-step-button"]');
      
      // Verify high total
      await expect(page.locator('[data-testid="total-amount"]')).toContainText('$150.00');
      
      // Enable split payment option
      await page.click('[data-testid="enable-split-payment-checkbox"]');
      
      // Configure first payment (credit card)
      await page.click('[data-testid="split-payment-1-credit-card"]');
      await page.fill('[data-testid="split-amount-1-input"]', '75.00');
      await fillValidCreditCardForm(page, '4111111111111111', '1');
      
      // Configure second payment (check)
      await page.click('[data-testid="split-payment-2-check"]');
      await page.fill('[data-testid="split-amount-2-input"]', '75.00');
      await page.fill('[data-testid="check-number-2-input"]', '2001');
      
      // Verify split total
      await expect(page.locator('[data-testid="split-total"]')).toContainText('$150.00');
      await expect(page.locator('[data-testid="split-validation-success"]')).toBeVisible();
      
      // Process split payment
      await page.click('[data-testid="process-split-payment-button"]');
      
      // Verify both payment methods processed
      await expect(page.locator('[data-testid="credit-card-payment-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="check-payment-pending"]')).toBeVisible();
      await expect(page.locator('[data-testid="split-payment-summary"]')).toBeVisible();
    });

    test('should handle group payment processing', async ({ page }) => {
      await testSetup.signIn('club_organizer');
      await page.goto('/club/group-payments');
      
      // Create group payment
      await page.click('[data-testid="create-group-payment-button"]');
      
      // Add multiple entries to group
      await page.fill('[data-testid="entry-search"]', 'John Doe');
      await page.click('[data-testid="add-entry-button"]');
      
      await page.fill('[data-testid="entry-search"]', 'Jane Smith');
      await page.click('[data-testid="add-entry-button"]');
      
      await page.fill('[data-testid="entry-search"]', 'Bob Johnson');
      await page.click('[data-testid="add-entry-button"]');
      
      // Verify group total
      await expect(page.locator('[data-testid="group-total"]')).toContainText('$105.00');
      await expect(page.locator('[data-testid="group-entries-count"]')).toContainText('3 entries');
      
      // Process group payment
      await page.click('[data-testid="payment-method-credit-card"]');
      await fillValidCreditCardForm(page);
      
      await page.fill('[data-testid="group-reference"]', 'CLUB-BATCH-2024-001');
      await page.fill('[data-testid="group-notes"]', 'Monthly club batch payment');
      
      await page.click('[data-testid="process-group-payment-button"]');
      
      // Verify group payment success
      await expect(page.locator('[data-testid="group-payment-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="group-payment-id"]')).toBeVisible();
      
      // Verify all entries marked as paid
      await expect(page.locator('[data-testid="all-entries-paid"]')).toBeVisible();
    });
  });

  test.describe('Payment Status Tracking and Audit', () => {
    test('should maintain comprehensive payment audit trail', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/payment-audit');
      
      // Search for specific transaction
      await page.fill('[data-testid="audit-search"]', 'TXN-12345');
      await page.click('[data-testid="search-audit-button"]');
      
      // Verify audit trail
      await expect(page.locator('[data-testid="audit-trail-TXN-12345"]')).toBeVisible();
      
      const auditEntries = page.locator('[data-testid*="audit-entry-"]');
      await expect(auditEntries).toHaveCount(4);
      
      // Verify audit entry details
      await expect(page.locator('[data-testid="audit-entry-1"]')).toContainText('Payment initiated');
      await expect(page.locator('[data-testid="audit-entry-2"]')).toContainText('Card validated');
      await expect(page.locator('[data-testid="audit-entry-3"]')).toContainText('Payment processed');
      await expect(page.locator('[data-testid="audit-entry-4"]')).toContainText('Confirmation sent');
      
      // Verify audit details
      await page.click('[data-testid="audit-entry-3"]');
      await expect(page.locator('[data-testid="audit-details"]')).toContainText('Amount: $35.00');
      await expect(page.locator('[data-testid="audit-details"]')).toContainText('Method: Credit Card');
      await expect(page.locator('[data-testid="audit-details"]')).toContainText('User: user@example.com');
    });

    test('should track payment status transitions correctly', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/payment-management');
      
      // Find payment to update
      await page.fill('[data-testid="payment-search"]', 'CHECK-1001');
      await page.click('[data-testid="search-button"]');
      
      await expect(page.locator('[data-testid="payment-CHECK-1001"]')).toBeVisible();
      await expect(page.locator('[data-testid="current-status-pending"]')).toBeVisible();
      
      // Update payment status
      await page.click('[data-testid="update-status-button"]');
      await page.selectOption('[data-testid="new-status-select"]', 'paid_by_check');
      await page.fill('[data-testid="status-notes"]', 'Check received and deposited on 2024-01-15');
      
      await page.click('[data-testid="confirm-status-update-button"]');
      
      // Verify status transition
      await expect(page.locator('[data-testid="status-updated-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="current-status-paid"]')).toBeVisible();
      
      // Verify entry status updated
      await expect(page.locator('[data-testid="entry-status-accepted"]')).toBeVisible();
      
      // Check status history
      await page.click('[data-testid="view-status-history-button"]');
      
      const statusHistory = page.locator('[data-testid*="status-history-"]');
      await expect(statusHistory).toHaveCount(2);
      
      await expect(page.locator('[data-testid="status-history-1"]')).toContainText('pending → paid_by_check');
    });

    test('should integrate payment status with entry management', async ({ page }) => {
      await testSetup.signIn('user');
      await page.goto('/dashboard/my-entries');
      
      // Verify entry status based on payment status
      const paidEntries = page.locator('[data-testid*="entry-paid-"]');
      const pendingEntries = page.locator('[data-testid*="entry-pending-"]');
      
      await expect(paidEntries.first()).toContainText('Accepted');
      await expect(pendingEntries.first()).toContainText('Payment Pending');
      
      // Click on pending entry
      await pendingEntries.first().click();
      
      // Verify payment options available
      await expect(page.locator('[data-testid="complete-payment-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-instructions"]')).toBeVisible();
      
      // Complete payment
      await page.click('[data-testid="complete-payment-button"]');
      await page.click('[data-testid="payment-method-credit-card"]');
      await fillValidCreditCardForm(page);
      await page.click('[data-testid="process-payment-button"]');
      
      // Verify entry status updated
      await expect(page.locator('[data-testid="payment-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="entry-status-accepted"]')).toBeVisible();
    });
  });

  test.describe('Financial Reporting and Reconciliation', () => {
    test('should generate comprehensive payment reports', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/financial-reports');
      
      // Select date range
      await page.fill('[data-testid="date-from-input"]', '2024-01-01');
      await page.fill('[data-testid="date-to-input"]', '2024-01-31');
      await page.click('[data-testid="generate-report-button"]');
      
      // Verify report data
      await expect(page.locator('[data-testid="total-revenue"]')).toContainText('$2,450.00');
      await expect(page.locator('[data-testid="total-transactions"]')).toContainText('70');
      
      // Verify payment method breakdown
      await expect(page.locator('[data-testid="credit-card-total"]')).toContainText('$1,680.00');
      await expect(page.locator('[data-testid="check-total"]')).toContainText('$525.00');
      await expect(page.locator('[data-testid="cash-total"]')).toContainText('$245.00');
      
      // Verify refund summary
      await expect(page.locator('[data-testid="refund-total"]')).toContainText('$150.00');
      await expect(page.locator('[data-testid="net-revenue"]')).toContainText('$2,300.00');
      
      // Export report
      const downloadPromise = page.waitForEvent('download');
      await page.click('[data-testid="export-csv-button"]');
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('payment-report');
    });

    test('should handle payment reconciliation workflow', async ({ page }) => {
      await testSetup.signIn('secretary');
      await page.goto('/secretary/payment-reconciliation');
      
      // View reconciliation dashboard
      await expect(page.locator('[data-testid="total-expected"]')).toContainText('$2,450.00');
      await expect(page.locator('[data-testid="total-received"]')).toContainText('$2,300.00');
      await expect(page.locator('[data-testid="outstanding-amount"]')).toContainText('$150.00');
      
      // Review outstanding payments
      await page.click('[data-testid="outstanding-payments-tab"]');
      
      const outstandingPayments = page.locator('[data-testid*="outstanding-payment-"]');
      await expect(outstandingPayments).toHaveCount(5);
      
      // Mark payment as received
      await page.click('[data-testid="outstanding-payment-1"] [data-testid="mark-received-button"]');
      
      await page.fill('[data-testid="received-amount"]', '35.00');
      await page.fill('[data-testid="received-date"]', '2024-01-20');
      await page.selectOption('[data-testid="payment-method"]', 'check');
      
      await page.click('[data-testid="confirm-received-button"]');
      
      // Verify reconciliation updated
      await expect(page.locator('[data-testid="total-received"]')).toContainText('$2,335.00');
      await expect(page.locator('[data-testid="outstanding-amount"]')).toContainText('$115.00');
    });
  });
});

// Helper functions
async function completeEntrySelection(page: Page) {
  await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
  await page.click('[data-testid="next-step-button"]');
  await page.check('[data-testid="class-novice-standard-checkbox"]');
}

async function fillValidCreditCardForm(page: Page, cardNumber = '4111111111111111', suffix = '') {
  await page.fill(`[data-testid="cardholder-name-input${suffix}"]`, 'John Doe');
  await page.fill(`[data-testid="card-number-input${suffix}"]`, cardNumber);
  await page.fill(`[data-testid="expiry-input${suffix}"]`, '12/25');
  await page.fill(`[data-testid="cvv-input${suffix}"]`, '123');
  await page.fill(`[data-testid="billing-street-input${suffix}"]`, '123 Main Street');
  await page.fill(`[data-testid="billing-city-input${suffix}"]`, 'Springfield');
  await page.selectOption(`[data-testid="billing-state-select${suffix}"]`, 'IL');
  await page.fill(`[data-testid="billing-zip-input${suffix}"]`, '62701');
}