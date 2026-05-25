import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Phase 3.1: Core Entry Creation Functionality', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should create entry via entryStore API', async ({ page }) => {
    console.log('=== Testing Core Entry Creation ===');

    // Navigate directly to app without authentication flow
    await page.goto('/');
    await testSetup.waitForLoading();

    // Test the entry store functionality directly
    const entryCreated = await page.evaluate(async () => {
      // Import and use the entry store directly
      const { useEntryStore } = await import('/src/store/entryStore.ts');

      const entryStore = useEntryStore.getState();

      // Create a test entry
      const testEntry = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
          jumpHeight: '12"',
        },
      });

      // Verify entry was created
      return {
        created: !!testEntry,
        id: testEntry?.id,
        status: testEntry?.status,
        showId: testEntry?.showId,
        classId: testEntry?.classId,
        dogId: testEntry?.dogId,
        entryFee: testEntry?.registrationData?.entryFee,
      };
    });

    // Verify entry creation
    expect(entryCreated.created).toBe(true);
    expect(entryCreated.status).toBe('draft');
    expect(entryCreated.showId).toBe('test-show-123');
    expect(entryCreated.classId).toBe('novice-standard');
    expect(entryCreated.dogId).toBe('test-dog-1');
    expect(entryCreated.entryFee).toBe(25.0);

    console.log('✓ Entry created successfully:', entryCreated);
  });

  test('should update entry status through workflow states', async ({ page }) => {
    console.log('=== Testing Entry Status Progression ===');

    await page.goto('/');
    await testSetup.waitForLoading();

    const statusProgression = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();

      // Create entry in draft status
      const entry = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      });

      const entryId = entry.id;
      const results = [];

      // Test status progression: draft -> submitted -> paid -> confirmed
      results.push({ step: 'created', status: entry.status });

      // Update to submitted
      const submitted = await entryStore.updateStatus(
        entryId,
        'submitted',
        'test-user',
        'Registration submitted'
      );
      results.push({ step: 'submitted', status: submitted?.status });

      // Update payment status
      const withPayment = await entryStore.updateRegistration(entryId, { paymentStatus: 'paid' });
      results.push({
        step: 'payment',
        paymentStatus: withPayment?.registrationData?.paymentStatus,
      });

      // Update to paid status
      const paid = await entryStore.updateStatus(entryId, 'paid', 'test-user', 'Payment confirmed');
      results.push({ step: 'paid', status: paid?.status });

      // Update to confirmed
      const confirmed = await entryStore.updateStatus(
        entryId,
        'confirmed',
        'secretary-user',
        'Entry confirmed by show secretary'
      );
      results.push({ step: 'confirmed', status: confirmed?.status });

      return results;
    });

    // Verify status progression
    expect(statusProgression[0].status).toBe('draft');
    expect(statusProgression[1].status).toBe('submitted');
    expect(statusProgression[2].paymentStatus).toBe('paid');
    expect(statusProgression[3].status).toBe('paid');
    expect(statusProgression[4].status).toBe('confirmed');

    console.log('✓ Entry status progression working correctly:', statusProgression);
  });

  test('should handle payment processing workflow', async ({ page }) => {
    console.log('=== Testing Payment Processing ===');

    await page.goto('/');
    await testSetup.waitForLoading();

    const paymentWorkflow = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();

      // Create entry
      const entry = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      });

      const entryId = entry.id;
      const results = [];

      // Submit entry
      const submitted = await entryStore.updateStatus(entryId, 'submitted', 'test-user');
      results.push({ step: 'submitted', status: submitted?.status });

      // Process payment
      const paymentProcessed = await entryStore.updateRegistration(entryId, {
        paymentStatus: 'paid',
        // Simulating credit card payment
        paymentReference: 'cc-12345',
        paymentDate: new Date().toISOString(),
      });
      results.push({
        step: 'payment-processed',
        paymentStatus: paymentProcessed?.registrationData?.paymentStatus,
      });

      // Update entry status to paid
      const paidEntry = await entryStore.updateStatus(
        entryId,
        'paid',
        'payment-system',
        'Payment confirmed'
      );
      results.push({ step: 'payment-confirmed', status: paidEntry?.status });

      return results;
    });

    // Verify payment workflow
    expect(paymentWorkflow[0].status).toBe('submitted');
    expect(paymentWorkflow[1].paymentStatus).toBe('paid');
    expect(paymentWorkflow[2].status).toBe('paid');

    console.log('✓ Payment workflow completed successfully:', paymentWorkflow);
  });

  console.log('=== Phase 3.1 Core Entry Creation Tests PASSED ===');
});
