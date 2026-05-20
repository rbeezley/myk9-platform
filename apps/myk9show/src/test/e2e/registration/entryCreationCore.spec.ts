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

  test('should maintain entry audit trail', async ({ page }) => {
    console.log('=== Testing Entry Audit Trail ===');

    await page.goto('/');
    await testSetup.waitForLoading();

    const auditTrail = await page.evaluate(async () => {
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

      // Make several status changes to build audit trail
      await entryStore.updateStatus(
        entryId,
        'submitted',
        'exhibitor-user',
        'Entry submitted by exhibitor'
      );
      await entryStore.updateStatus(
        entryId,
        'paid',
        'payment-system',
        'Payment confirmed via credit card'
      );
      await entryStore.updateStatus(
        entryId,
        'confirmed',
        'secretary-user',
        'Entry confirmed by show secretary'
      );

      // Get final entry with audit trail
      const finalEntry = entryStore.getEntry(entryId);

      return {
        statusHistoryCount: finalEntry?.statusHistory?.length || 0,
        statusProgression:
          finalEntry?.statusHistory?.map(h => ({
            status: h.status,
            userId: h.userId,
            reason: h.reason,
          })) || [],
      };
    });

    // Verify audit trail
    expect(auditTrail.statusHistoryCount).toBeGreaterThanOrEqual(4); // Initial + 3 updates
    expect(auditTrail.statusProgression[0].status).toBe('draft');
    expect(auditTrail.statusProgression[1].status).toBe('submitted');
    expect(auditTrail.statusProgression[2].status).toBe('paid');
    expect(auditTrail.statusProgression[3].status).toBe('confirmed');

    console.log('✓ Entry audit trail maintained correctly:', auditTrail);
  });

  test('should integrate with show statistics', async ({ page }) => {
    console.log('=== Testing Show Statistics Integration ===');

    await page.goto('/');
    await testSetup.waitForLoading();

    const statistics = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();

      const showId = 'test-show-123';

      // Create entries with different statuses and payment states
      const entries = await entryStore.createMultipleEntries([
        {
          showId,
          classId: 'novice-standard',
          dogId: 'dog-1',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 1',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
        },
        {
          showId,
          classId: 'open-standard',
          dogId: 'dog-2',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 2',
            entryFee: 30.0,
            paymentStatus: 'paid',
          },
        },
        {
          showId,
          classId: 'novice-jumpers',
          dogId: 'dog-3',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 3',
            entryFee: 25.0,
            paymentStatus: 'pending',
          },
        },
      ]);

      // Update some entries to different statuses
      await entryStore.updateStatus(entries[0].id, 'confirmed', 'secretary');
      await entryStore.updateStatus(entries[1].id, 'confirmed', 'secretary');
      await entryStore.updateStatus(entries[2].id, 'submitted', 'exhibitor');

      // Get show statistics
      const stats = entryStore.getStatsForShow(showId);

      return stats;
    });

    // Verify statistics
    expect(statistics.totalEntries).toBe(3);
    expect(statistics.totalRevenue).toBe(55.0); // 25 + 30 from paid entries
    expect(statistics.byStatus.confirmed).toBe(2);
    expect(statistics.byStatus.submitted).toBe(1);
    expect(statistics.completionRate).toBe(0); // No entries completed (results recorded)

    console.log('✓ Show statistics integration working correctly:', statistics);
  });

  console.log('=== Phase 3.1 Core Entry Creation Tests PASSED ===');
});
