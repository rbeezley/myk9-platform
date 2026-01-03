import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Payment Flow', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should complete credit card payment for show registration', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete registration steps
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Reach payment step
    await expect(page.locator('[data-testid="payment-step"]')).toBeVisible();
    
    // Review charges
    await expect(page.locator('[data-testid="entry-fee"]')).toContainText('$35.00');
    await expect(page.locator('[data-testid="processing-fee"]')).toContainText('$2.50');
    await expect(page.locator('[data-testid="total-amount"]')).toContainText('$37.50');
    
    // Select credit card payment
    await page.click('[data-testid="payment-method-credit-card"]');
    
    // Fill credit card information
    await page.fill('[data-testid="card-number-input"]', '4111111111111111');
    await page.fill('[data-testid="expiry-input"]', '12/25');
    await page.fill('[data-testid="cvv-input"]', '123');
    await page.fill('[data-testid="cardholder-name-input"]', 'John Doe');
    
    // Fill billing address
    await page.fill('[data-testid="billing-address-input"]', '123 Main St');
    await page.fill('[data-testid="billing-city-input"]', 'Springfield');
    await page.selectOption('[data-testid="billing-state-select"]', 'IL');
    await page.fill('[data-testid="billing-zip-input"]', '62701');
    
    // Accept terms
    await page.check('[data-testid="accept-payment-terms-checkbox"]');
    
    // Process payment
    await page.click('[data-testid="process-payment-button"]');
    
    // Wait for processing
    await expect(page.locator('[data-testid="payment-processing"]')).toBeVisible();
    
    // Verify success
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="transaction-id"]')).toBeVisible();
    
    // Check confirmation email sent
    await expect(page.locator('[data-testid="confirmation-email-sent"]')).toBeVisible();
  });

  test('should handle check payment processing', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete registration steps
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Select check payment
    await page.click('[data-testid="payment-method-check"]');
    
    // Fill check information
    await page.fill('[data-testid="check-number-input"]', '1001');
    await page.fill('[data-testid="bank-name-input"]', 'First National Bank');
    await page.fill('[data-testid="account-holder-input"]', 'John Doe');
    
    // Add memo
    await page.fill('[data-testid="check-memo-input"]', 'Dog show entry - Buddy');
    
    // Review check payment instructions
    await expect(page.locator('[data-testid="check-instructions"]')).toBeVisible();
    await expect(page.locator('[data-testid="mailing-address"]')).toContainText('Springfield Dog Club');
    
    // Submit check payment
    await page.click('[data-testid="submit-check-payment-button"]');
    
    // Verify submission
    await expect(page.locator('[data-testid="check-payment-submitted"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-status-pending"]')).toBeVisible();
    
    // Check payment tracking
    await expect(page.locator('[data-testid="check-tracking-number"]')).toBeVisible();
  });

  test('should handle PayPal payment integration', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete registration steps
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Select PayPal payment
    await page.click('[data-testid="payment-method-paypal"]');
    
    // Review PayPal fee structure
    await expect(page.locator('[data-testid="paypal-fee-disclosure"]')).toBeVisible();
    await expect(page.locator('[data-testid="paypal-total"]')).toContainText('$38.61'); // Includes PayPal fees
    
    // Initiate PayPal payment
    await page.click('[data-testid="paypal-checkout-button"]');
    
    // Mock PayPal popup/redirect
    await expect(page.locator('[data-testid="paypal-processing"]')).toBeVisible();
    
    // Simulate successful return from PayPal
    await page.evaluate(() => {
      window.postMessage({ type: 'PAYPAL_SUCCESS', paymentId: 'PAYID-123456' }, '*');
    });
    
    // Verify payment success
    await expect(page.locator('[data-testid="paypal-payment-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="paypal-transaction-id"]')).toContainText('PAYID-123456');
  });

  test('should handle payment failures and retry', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/show-123/register');
    
    // Complete registration steps
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="class-option-novice-standard"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Use a card that will be declined
    await page.click('[data-testid="payment-method-credit-card"]');
    await page.fill('[data-testid="card-number-input"]', '4000000000000002'); // Declined card
    await page.fill('[data-testid="expiry-input"]', '12/25');
    await page.fill('[data-testid="cvv-input"]', '123');
    await page.fill('[data-testid="cardholder-name-input"]', 'John Doe');
    
    // Fill billing address
    await page.fill('[data-testid="billing-address-input"]', '123 Main St');
    await page.fill('[data-testid="billing-city-input"]', 'Springfield');
    await page.selectOption('[data-testid="billing-state-select"]', 'IL');
    await page.fill('[data-testid="billing-zip-input"]', '62701');
    
    await page.check('[data-testid="accept-payment-terms-checkbox"]');
    await page.click('[data-testid="process-payment-button"]');
    
    // Verify error handling
    await expect(page.locator('[data-testid="payment-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-error-message"]')).toContainText('Card was declined');
    
    // Try different payment method
    await page.click('[data-testid="try-different-payment-button"]');
    
    // Switch to PayPal
    await page.click('[data-testid="payment-method-paypal"]');
    await page.click('[data-testid="paypal-checkout-button"]');
    
    // Simulate successful PayPal payment
    await page.evaluate(() => {
      window.postMessage({ type: 'PAYPAL_SUCCESS', paymentId: 'PAYID-789012' }, '*');
    });
    
    // Verify recovery
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible();
  });

  test('should process refunds correctly', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/secretary/payments');
    
    // Find payment to refund
    await page.click('[data-testid="payment-search-input"]');
    await page.fill('[data-testid="payment-search-input"]', 'TXN-123456');
    await page.press('[data-testid="payment-search-input"]', 'Enter');
    
    // Select payment for refund
    await page.click('[data-testid="payment-row-txn-123456"]');
    await page.click('[data-testid="initiate-refund-button"]');
    
    // Fill refund details
    await page.selectOption('[data-testid="refund-reason-select"]', 'withdrawal');
    await page.fill('[data-testid="refund-amount-input"]', '35.00');
    await page.fill('[data-testid="refund-notes-textarea"]', 'Exhibitor requested withdrawal due to dog injury');
    
    // Calculate refund fees
    await page.click('[data-testid="calculate-refund-button"]');
    await expect(page.locator('[data-testid="refund-amount"]')).toContainText('$35.00');
    await expect(page.locator('[data-testid="processing-fee-retained"]')).toContainText('$2.50');
    await expect(page.locator('[data-testid="net-refund"]')).toContainText('$32.50');
    
    // Process refund
    await page.click('[data-testid="process-refund-button"]');
    
    // Confirm refund
    await page.click('[data-testid="confirm-refund-button"]');
    
    // Verify refund processing
    await expect(page.locator('[data-testid="refund-processing"]')).toBeVisible();
    await expect(page.locator('[data-testid="refund-confirmation"]')).toBeVisible();
    
    // Check refund appears in payment history
    await page.goto('/secretary/payment-history');
    await expect(page.locator('[data-testid="refund-txn-123456"]')).toBeVisible();
  });

  test('should handle partial refunds for multi-class entries', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/secretary/payments/multi-class-123');
    
    // View multi-class payment
    await expect(page.locator('[data-testid="total-classes"]')).toContainText('3 classes');
    await expect(page.locator('[data-testid="total-paid"]')).toContainText('$95.00');
    
    // Select classes for partial refund
    await page.check('[data-testid="refund-class-2-checkbox"]');
    await page.check('[data-testid="refund-class-3-checkbox"]');
    
    // Calculate partial refund
    await page.click('[data-testid="calculate-partial-refund-button"]');
    await expect(page.locator('[data-testid="classes-refunded"]')).toContainText('2 classes');
    await expect(page.locator('[data-testid="refund-amount"]')).toContainText('$60.00');
    
    // Process partial refund
    await page.fill('[data-testid="partial-refund-reason"]', 'Classes cancelled due to judge unavailability');
    await page.click('[data-testid="process-partial-refund-button"]');
    
    // Verify remaining balance
    await expect(page.locator('[data-testid="remaining-balance"]')).toContainText('$35.00');
    await expect(page.locator('[data-testid="remaining-classes"]')).toContainText('1 class');
  });

  test('should track payment analytics and reporting', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/secretary/payment-reports');
    
    // View payment summary
    await expect(page.locator('[data-testid="total-revenue"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-method-breakdown"]')).toBeVisible();
    
    // Filter by date range
    await page.fill('[data-testid="date-from-input"]', '2024-01-01');
    await page.fill('[data-testid="date-to-input"]', '2024-12-31');
    await page.click('[data-testid="apply-date-filter-button"]');
    
    // View detailed breakdown
    await page.click('[data-testid="detailed-breakdown-tab"]');
    await expect(page.locator('[data-testid="credit-card-total"]')).toBeVisible();
    await expect(page.locator('[data-testid="check-total"]')).toBeVisible();
    await expect(page.locator('[data-testid="paypal-total"]')).toBeVisible();
    
    // View refund summary
    await page.click('[data-testid="refunds-tab"]');
    await expect(page.locator('[data-testid="total-refunds"]')).toBeVisible();
    await expect(page.locator('[data-testid="refund-reasons-chart"]')).toBeVisible();
    
    // Export payment report
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-payment-report-button"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('payment-report');
  });

  test('should handle payment disputes and chargebacks', async ({ page }) => {
    await testSetup.signIn('secretary');
    await page.goto('/secretary/payment-disputes');
    
    // View new chargeback notification
    await expect(page.locator('[data-testid="chargeback-alert"]')).toBeVisible();
    await page.click('[data-testid="chargeback-case-456"]');
    
    // Review chargeback details
    await expect(page.locator('[data-testid="chargeback-amount"]')).toContainText('$37.50');
    await expect(page.locator('[data-testid="chargeback-reason"]')).toContainText('Unauthorized transaction');
    
    // Gather supporting evidence
    await page.click('[data-testid="gather-evidence-button"]');
    
    // Upload documentation
    await page.setInputFiles('[data-testid="evidence-upload"]', 'test-files/registration-confirmation.pdf');
    await page.fill('[data-testid="evidence-description"]', 'Registration confirmation with digital signature');
    
    // Add transaction details
    await page.fill('[data-testid="transaction-notes"]', 'Valid registration completed online with email confirmation sent');
    
    // Submit dispute response
    await page.click('[data-testid="submit-dispute-response-button"]');
    
    // Track dispute status
    await expect(page.locator('[data-testid="dispute-status-submitted"]')).toBeVisible();
    await expect(page.locator('[data-testid="expected-resolution-date"]')).toBeVisible();
  });

  test('should handle payment plan setup for expensive entries', async ({ page }) => {
    await testSetup.signIn('user');
    await page.goto('/shows/premium-show-789/register');
    
    // Register for multiple expensive classes
    await page.click('[data-testid="dog-card-1"] [data-testid="select-dog-button"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Select multiple premium classes
    await page.check('[data-testid="class-specialty-1-checkbox"]'); // $75
    await page.check('[data-testid="class-specialty-2-checkbox"]'); // $75
    await page.check('[data-testid="class-specialty-3-checkbox"]'); // $75
    await page.click('[data-testid="next-step-button"]');
    
    // Reach payment step with high total
    await expect(page.locator('[data-testid="total-amount"]')).toContainText('$225.00');
    
    // Payment plan option appears for high amounts
    await expect(page.locator('[data-testid="payment-plan-option"]')).toBeVisible();
    await page.click('[data-testid="payment-method-payment-plan"]');
    
    // Configure payment plan
    await page.selectOption('[data-testid="payment-plan-duration"]', '3-months');
    await expect(page.locator('[data-testid="monthly-payment"]')).toContainText('$75.00');
    await expect(page.locator('[data-testid="plan-fee"]')).toContainText('$9.00');
    
    // Set up automatic payments
    await page.fill('[data-testid="card-number-input"]', '4111111111111111');
    await page.fill('[data-testid="expiry-input"]', '12/25');
    await page.fill('[data-testid="cvv-input"]', '123');
    
    // Agree to payment plan terms
    await page.check('[data-testid="payment-plan-terms-checkbox"]');
    
    // Set up payment plan
    await page.click('[data-testid="setup-payment-plan-button"]');
    
    // Verify payment plan creation
    await expect(page.locator('[data-testid="payment-plan-created"]')).toBeVisible();
    await expect(page.locator('[data-testid="first-payment-date"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-plan-id"]')).toBeVisible();
  });
});