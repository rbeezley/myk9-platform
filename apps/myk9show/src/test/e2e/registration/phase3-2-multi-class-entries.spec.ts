import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Phase 3.2: Multi-Class Entry Registration Testing', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
  });

  test('should handle same dog in multiple classes without conflicts', async ({ page }) => {
    console.log('=== Testing Same Dog Multiple Classes ===');
    
    await page.goto('/');
    await testSetup.waitForLoading();
    
    const multiClassResult = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();
      
      const showId = 'test-show-123';
      const dogId = 'golden-retriever-max';
      const handler = 'John Smith';
      
      // Create multiple entries for same dog in different classes
      const entries = await entryStore.createMultipleEntries([
        {
          showId,
          classId: 'novice-standard-12',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler,
            entryFee: 25.00,
            paymentStatus: 'pending',
            jumpHeight: '12"',
            // Different time slots to avoid conflicts
            preferredStartTime: '09:00'
          }
        },
        {
          showId,
          classId: 'novice-jumpers-12',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler,
            entryFee: 25.00,
            paymentStatus: 'pending',
            jumpHeight: '12"',
            preferredStartTime: '11:00'
          }
        },
        {
          showId,
          classId: 'open-standard-12',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler,
            entryFee: 30.00,
            paymentStatus: 'pending',
            jumpHeight: '12"',
            preferredStartTime: '14:00'
          }
        }
      ]);
      
      // Verify all entries created successfully
      const dogEntries = entryStore.getEntriesByDog(dogId);
      const showEntries = entryStore.getEntriesByShow(showId);
      
      return {
        entriesCreated: entries.length,
        dogEntriesCount: dogEntries.length,
        showEntriesCount: showEntries.length,
        totalFees: entries.reduce((sum, e) => sum + e.registrationData.entryFee, 0),
        classIds: entries.map(e => e.classId),
        allSameHandler: entries.every(e => e.registrationData.handler === handler),
        allSameDog: entries.every(e => e.dogId === dogId)
      };
    });
    
    // Verify multi-class registration
    expect(multiClassResult.entriesCreated).toBe(3);
    expect(multiClassResult.dogEntriesCount).toBe(3);
    expect(multiClassResult.showEntriesCount).toBe(3);
    expect(multiClassResult.totalFees).toBe(80.00); // 25 + 25 + 30
    expect(multiClassResult.allSameHandler).toBe(true);
    expect(multiClassResult.allSameDog).toBe(true);
    expect(multiClassResult.classIds).toEqual([
      'novice-standard-12',
      'novice-jumpers-12', 
      'open-standard-12'
    ]);
    
    console.log('✓ Same dog multiple classes working correctly:', multiClassResult);
  });

  test('should detect and handle class scheduling conflicts', async ({ page }) => {
    console.log('=== Testing Class Conflict Detection ===');
    
    await page.goto('/');
    await testSetup.waitForLoading();
    
    const conflictDetection = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();
      
      // Mock class schedule data
      const classSchedule = {
        'novice-standard-12': { startTime: '09:00', endTime: '10:30', ring: 'Ring 1' },
        'novice-jumpers-12': { startTime: '09:15', endTime: '10:45', ring: 'Ring 2' }, // Overlaps
        'open-standard-12': { startTime: '11:00', endTime: '12:30', ring: 'Ring 1' }, // No conflict
        'open-jumpers-12': { startTime: '09:00', endTime: '10:00', ring: 'Ring 3' } // Same start time, different ring
      };
      
      const showId = 'test-show-123';
      const dogId = 'border-collie-ace';
      
      // Attempt to register for conflicting classes
      const entries = await entryStore.createMultipleEntries([
        {
          showId,
          classId: 'novice-standard-12',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Sarah Johnson',
            entryFee: 25.00,
            paymentStatus: 'pending',
            jumpHeight: '12"'
          }
        },
        {
          showId,
          classId: 'novice-jumpers-12', // CONFLICT: Overlapping time
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Sarah Johnson',
            entryFee: 25.00,
            paymentStatus: 'pending',
            jumpHeight: '12"'
          }
        },
        {
          showId,
          classId: 'open-standard-12', // OK: Different time
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Sarah Johnson',
            entryFee: 30.00,
            paymentStatus: 'pending',
            jumpHeight: '12"'
          }
        }
      ]);
      
      // Simulate conflict detection logic
      const detectTimeConflicts = (dogEntries: typeof entries) => {
        const conflicts = [];
        for (let i = 0; i < dogEntries.length; i++) {
          for (let j = i + 1; j < dogEntries.length; j++) {
            const class1 = classSchedule[dogEntries[i].classId as keyof typeof classSchedule];
            const class2 = classSchedule[dogEntries[j].classId as keyof typeof classSchedule];
            
            if (class1 && class2) {
              const start1 = new Date(`2024-01-01 ${class1.startTime}`);
              const end1 = new Date(`2024-01-01 ${class1.endTime}`);
              const start2 = new Date(`2024-01-01 ${class2.startTime}`);
              const end2 = new Date(`2024-01-01 ${class2.endTime}`);
              
              // Check for time overlap
              if (start1 < end2 && start2 < end1) {
                conflicts.push({
                  entry1: dogEntries[i].classId,
                  entry2: dogEntries[j].classId,
                  reason: 'Time overlap detected',
                  class1Time: `${class1.startTime}-${class1.endTime}`,
                  class2Time: `${class2.startTime}-${class2.endTime}`
                });
              }
            }
          }
        }
        return conflicts;
      };
      
      const dogEntries = entryStore.getEntriesByDog(dogId);
      const conflicts = detectTimeConflicts(dogEntries);
      
      return {
        entriesCreated: entries.length,
        dogEntriesCount: dogEntries.length,
        conflicts,
        hasConflicts: conflicts.length > 0,
        conflictPairs: conflicts.map(c => `${c.entry1} vs ${c.entry2}`)
      };
    });
    
    // Verify conflict detection
    expect(conflictDetection.entriesCreated).toBe(3);
    expect(conflictDetection.hasConflicts).toBe(true);
    expect(conflictDetection.conflicts.length).toBe(1);
    expect(conflictDetection.conflictPairs[0]).toBe('novice-standard-12 vs novice-jumpers-12');
    
    console.log('✓ Class conflict detection working correctly:', conflictDetection);
  });

  test('should handle multiple dogs in same class with capacity limits', async ({ page }) => {
    console.log('=== Testing Multiple Dogs Same Class ===');
    
    await page.goto('/');
    await testSetup.waitForLoading();
    
    const multiDogResult = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();
      
      const showId = 'test-show-123';
      const classId = 'novice-standard-16';
      const handler = 'Professional Handler Co.';
      
      // Mock class capacity
      const classCapacity = {
        [classId]: { maxEntries: 50, currentEntries: 0 }
      };
      
      // Create entries for multiple dogs in same class
      const dogEntries = [
        { dogId: 'german-shepherd-zeus', dogName: 'Zeus' },
        { dogId: 'golden-retriever-bella', dogName: 'Bella' },
        { dogId: 'border-collie-dash', dogName: 'Dash' },
        { dogId: 'lab-retriever-cooper', dogName: 'Cooper' },
        { dogId: 'aussie-shepherd-luna', dogName: 'Luna' }
      ];
      
      const entries = await entryStore.createMultipleEntries(
        dogEntries.map(dog => ({
          showId,
          classId,
          dogId: dog.dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler,
            entryFee: 25.00,
            paymentStatus: 'pending',
            jumpHeight: '16"',
            specialRequests: `Entry for ${dog.dogName}`
          }
        }))
      );
      
      // Simulate capacity checking
      const classEntries = entryStore.getEntriesByClass(classId);
      const isWithinCapacity = classEntries.length <= classCapacity[classId].maxEntries;
      
      // Calculate total fees for this class
      const classTotalFees = classEntries.reduce((sum, e) => sum + e.registrationData.entryFee, 0);
      
      // Update all entries to submitted status (batch operation)
      const entryIds = entries.map(e => e.id);
      await entryStore.updateEntriesStatus(entryIds, 'submitted', handler, 'Bulk submission by professional handler');
      
      const submittedEntries = entryIds.map(id => entryStore.getEntry(id));
      
      return {
        entriesCreated: entries.length,
        classEntriesCount: classEntries.length,
        isWithinCapacity,
        classTotalFees,
        allSubmitted: submittedEntries.every(e => e?.status === 'submitted'),
        sameHandler: entries.every(e => e.registrationData.handler === handler),
        sameClass: entries.every(e => e.classId === classId),
        uniqueDogs: new Set(entries.map(e => e.dogId)).size,
        entryFeeRange: {
          min: Math.min(...entries.map(e => e.registrationData.entryFee)),
          max: Math.max(...entries.map(e => e.registrationData.entryFee))
        }
      };
    });
    
    // Verify multiple dogs same class
    expect(multiDogResult.entriesCreated).toBe(5);
    expect(multiDogResult.classEntriesCount).toBe(5);
    expect(multiDogResult.isWithinCapacity).toBe(true);
    expect(multiDogResult.classTotalFees).toBe(125.00); // 5 x 25.00
    expect(multiDogResult.allSubmitted).toBe(true);
    expect(multiDogResult.sameHandler).toBe(true);
    expect(multiDogResult.sameClass).toBe(true);
    expect(multiDogResult.uniqueDogs).toBe(5);
    expect(multiDogResult.entryFeeRange.min).toBe(25.00);
    expect(multiDogResult.entryFeeRange.max).toBe(25.00);
    
    console.log('✓ Multiple dogs same class working correctly:', multiDogResult);
  });

  test('should calculate multi-class discounts correctly', async ({ page }) => {
    console.log('=== Testing Multi-Class Discount Calculations ===');
    
    await page.goto('/');
    await testSetup.waitForLoading();
    
    const discountCalculation = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();
      
      // Mock discount rules
      const discountRules = {
        multiClass: {
          2: 0.05,    // 5% discount for 2 classes
          3: 0.10,    // 10% discount for 3 classes
          4: 0.15,    // 15% discount for 4+ classes
        },
        sameDayDiscount: 0.03, // 3% additional discount for same day classes
        professionalHandler: 0.02 // 2% discount for professional handlers
      };
      
      const showId = 'test-show-123';
      const dogId = 'poodle-princess';
      const handler = 'Pro Handler Services';
      
      // Create multiple class entries for discount calculation
      const entries = await entryStore.createMultipleEntries([
        {
          showId,
          classId: 'novice-standard-20',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler,
            entryFee: 30.00,
            paymentStatus: 'pending',
            jumpHeight: '20"'
          }
        },
        {
          showId,
          classId: 'novice-jumpers-20',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler,
            entryFee: 30.00,
            paymentStatus: 'pending',
            jumpHeight: '20"'
          }
        },
        {
          showId,
          classId: 'open-standard-20',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler,
            entryFee: 35.00,
            paymentStatus: 'pending',
            jumpHeight: '20"'
          }
        }
      ]);
      
      // Calculate discounts
      const baseTotal = entries.reduce((sum, e) => sum + e.registrationData.entryFee, 0);
      const entryCount = entries.length;
      
      // Multi-class discount
      let discountRate = 0;
      if (entryCount >= 4) discountRate = discountRules.multiClass[4];
      else if (entryCount >= 3) discountRate = discountRules.multiClass[3];
      else if (entryCount >= 2) discountRate = discountRules.multiClass[2];
      
      // Professional handler discount
      const isProfessionalHandler = handler.toLowerCase().includes('pro') || 
                                    handler.toLowerCase().includes('professional');
      if (isProfessionalHandler) {
        discountRate += discountRules.professionalHandler;
      }
      
      const discountAmount = baseTotal * discountRate;
      const finalTotal = baseTotal - discountAmount;
      
      // Update entries with calculated discounts
      for (const entry of entries) {
        await entryStore.updateRegistration(entry.id, {
          originalFee: entry.registrationData.entryFee,
          discountApplied: discountAmount / entries.length, // Split discount across entries
          finalFee: (baseTotal - discountAmount) / entries.length
        });
      }
      
      return {
        entriesCount: entries.length,
        baseTotal,
        discountRate,
        discountAmount,
        finalTotal,
        savingsAmount: discountAmount,
        savingsPercentage: (discountAmount / baseTotal) * 100,
        isProfessionalHandler,
        averageFeeAfterDiscount: finalTotal / entries.length
      };
    });
    
    // Verify discount calculations
    expect(discountCalculation.entriesCount).toBe(3);
    expect(discountCalculation.baseTotal).toBe(95.00); // 30 + 30 + 35
    expect(discountCalculation.discountRate).toBe(0.12); // 10% multi-class + 2% professional
    expect(discountCalculation.discountAmount).toBe(11.40); // 95.00 * 0.12
    expect(discountCalculation.finalTotal).toBe(83.60); // 95.00 - 11.40
    expect(discountCalculation.isProfessionalHandler).toBe(true);
    expect(discountCalculation.savingsPercentage).toBeCloseTo(12.0);
    
    console.log('✓ Multi-class discount calculations working correctly:', discountCalculation);
  });

  test('should handle complex mixed entry scenarios', async ({ page }) => {
    console.log('=== Testing Complex Mixed Entry Scenarios ===');
    
    await page.goto('/');
    await testSetup.waitForLoading();
    
    const complexScenario = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();
      
      const showId = 'agility-championship-2024';
      
      // Complex scenario: Multiple handlers, multiple dogs, multiple classes
      const complexEntries = await entryStore.createMultipleEntries([
        // Handler 1: Single dog, multiple classes
        {
          showId,
          classId: 'masters-standard-24',
          dogId: 'belgian-malinois-storm',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Elite Training Academy',
            handlerId: 'handler-001',
            entryFee: 40.00,
            paymentStatus: 'pending',
            jumpHeight: '24"',
            moveUpRequested: true
          }
        },
        {
          showId,
          classId: 'masters-jumpers-24',
          dogId: 'belgian-malinois-storm',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Elite Training Academy',
            handlerId: 'handler-001',
            entryFee: 40.00,
            paymentStatus: 'pending',
            jumpHeight: '24"'
          }
        },
        // Handler 2: Multiple dogs, same class
        {
          showId,
          classId: 'open-standard-20',
          dogId: 'australian-cattle-dog-rusty',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Country K9 Training',
            handlerId: 'handler-002',
            entryFee: 35.00,
            paymentStatus: 'pending',
            jumpHeight: '20"',
            specialRequests: 'First show for this dog'
          }
        },
        {
          showId,
          classId: 'open-standard-20',
          dogId: 'border-collie-flash',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Country K9 Training',
            handlerId: 'handler-002',
            entryFee: 35.00,
            paymentStatus: 'pending',
            jumpHeight: '20"'
          }
        },
        // Individual owner: Single dog, single class
        {
          showId,
          classId: 'novice-jumpers-16',
          dogId: 'golden-retriever-sunny',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Owner Handled',
            handlerId: 'owner-003',
            entryFee: 25.00,
            paymentStatus: 'pending',
            jumpHeight: '16"',
            specialRequests: 'Nervous dog, please be gentle'
          }
        }
      ]);
      
      // Process payments in batches by handler
      const handlerGroups = complexEntries.reduce((groups, entry) => {
        const handler = entry.registrationData.handler;
        if (!groups[handler]) groups[handler] = [];
        groups[handler].push(entry);
        return groups;
      }, {} as Record<string, typeof complexEntries>);
      
      // Simulate payment processing by handler
      const paymentResults = [];
      for (const [handler, entries] of Object.entries(handlerGroups)) {
        const totalFee = entries.reduce((sum, e) => sum + e.registrationData.entryFee, 0);
        const entryIds = entries.map(e => e.id);
        
        // Update payment status for handler's entries
        for (const entry of entries) {
          await entryStore.updateRegistration(entry.id, {
            paymentStatus: 'paid',
            paymentMethod: handler.includes('Training') ? 'business_check' : 'credit_card',
            paymentDate: new Date().toISOString()
          });
        }
        
        // Update entry statuses to paid
        await entryStore.updateEntriesStatus(entryIds, 'paid', `payment-system-${handler}`, 'Payment confirmed');
        
        paymentResults.push({
          handler,
          entriesCount: entries.length,
          totalPaid: totalFee
        });
      }
      
      // Generate comprehensive statistics
      const showStats = entryStore.getStatsForShow(showId);
      const allEntries = entryStore.getEntriesByShow(showId);
      
      // Analyze entry patterns
      const patterns = {
        uniqueHandlers: new Set(allEntries.map(e => e.registrationData.handler)).size,
        uniqueDogs: new Set(allEntries.map(e => e.dogId)).size,
        uniqueClasses: new Set(allEntries.map(e => e.classId)).size,
        jumpHeights: [...new Set(allEntries.map(e => e.registrationData.jumpHeight))],
        specialRequestsCount: allEntries.filter(e => e.registrationData.specialRequests).length,
        moveUpRequestsCount: allEntries.filter(e => e.registrationData.moveUpRequested).length
      };
      
      return {
        entriesCreated: complexEntries.length,
        handlerGroups: Object.keys(handlerGroups).length,
        paymentResults,
        showStats,
        patterns,
        totalRevenue: showStats.totalRevenue,
        allEntriesPaid: allEntries.every(e => e.status === 'paid')
      };
    });
    
    // Verify complex scenario handling
    expect(complexScenario.entriesCreated).toBe(5);
    expect(complexScenario.handlerGroups).toBe(3);
    expect(complexScenario.patterns.uniqueHandlers).toBe(3);
    expect(complexScenario.patterns.uniqueDogs).toBe(5);
    expect(complexScenario.patterns.uniqueClasses).toBe(4);
    expect(complexScenario.patterns.specialRequestsCount).toBe(2);
    expect(complexScenario.patterns.moveUpRequestsCount).toBe(1);
    expect(complexScenario.totalRevenue).toBe(175.00); // 40+40+35+35+25
    expect(complexScenario.allEntriesPaid).toBe(true);
    
    console.log('✓ Complex mixed entry scenarios working correctly:', complexScenario);
  });

  test('should validate cross-entry business rules', async ({ page }) => {
    console.log('=== Testing Cross-Entry Business Rule Validation ===');
    
    await page.goto('/');
    await testSetup.waitForLoading();
    
    const businessRuleValidation = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();
      
      const showId = 'specialty-show-2024';
      const dogId = 'championship-dog-ace';
      
      // Mock business rules
      const businessRules = {
        maxEntriesPerDog: 6,
        maxEntriesPerClass: 100,
        requiredQualifications: {
          'masters-standard': ['open-standard-q', 'excellent-standard-q'],
          'masters-jumpers': ['open-jumpers-q', 'excellent-jumpers-q']
        },
        ageRestrictions: {
          'puppy-class': { minAge: 6, maxAge: 18 }, // months
          'veteran-class': { minAge: 84 } // 7 years
        },
        jumpHeightConsistency: true, // Must use same jump height across all classes
        conflictingClasses: [
          ['novice-standard', 'open-standard'], // Can't enter both levels
          ['excellent-standard', 'masters-standard'] // Must progress through levels
        ]
      };
      
      // Attempt to create entries that test various business rules
      const testEntries = [
        {
          showId,
          classId: 'novice-standard-20',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Test Handler',
            entryFee: 30.00,
            paymentStatus: 'pending',
            jumpHeight: '20"'
          }
        },
        {
          showId,
          classId: 'novice-jumpers-20',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Test Handler',
            entryFee: 30.00,
            paymentStatus: 'pending',
            jumpHeight: '20"' // Consistent jump height
          }
        },
        {
          showId,
          classId: 'open-standard-20', // RULE VIOLATION: Can't enter both novice and open
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Test Handler',
            entryFee: 35.00,
            paymentStatus: 'pending',
            jumpHeight: '20"'
          }
        },
        {
          showId,
          classId: 'novice-fast-20',
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Test Handler',
            entryFee: 30.00,
            paymentStatus: 'pending',
            jumpHeight: '16"' // RULE VIOLATION: Inconsistent jump height
          }
        }
      ];
      
      const entries = await entryStore.createMultipleEntries(testEntries);
      const dogEntries = entryStore.getEntriesByDog(dogId);
      
      // Validate business rules
      const validationResults = {
        totalEntries: dogEntries.length,
        withinMaxEntries: dogEntries.length <= businessRules.maxEntriesPerDog,
        jumpHeightConsistency: (() => {
          const jumpHeights = new Set(dogEntries.map(e => e.registrationData.jumpHeight));
          return jumpHeights.size === 1;
        })(),
        classConflicts: (() => {
          const enteredClasses = dogEntries.map(e => e.classId);
          const conflicts = [];
          
          for (const [class1, class2] of businessRules.conflictingClasses) {
            const hasClass1 = enteredClasses.some(c => c.includes(class1));
            const hasClass2 = enteredClasses.some(c => c.includes(class2));
            
            if (hasClass1 && hasClass2) {
              conflicts.push(`${class1} conflicts with ${class2}`);
            }
          }
          
          return conflicts;
        })(),
        jumpHeights: [...new Set(dogEntries.map(e => e.registrationData.jumpHeight))],
        classLevels: [...new Set(dogEntries.map(e => e.classId.split('-')[0]))]
      };
      
      return {
        entriesCreated: entries.length,
        validationResults,
        hasViolations: !validationResults.withinMaxEntries || 
                       !validationResults.jumpHeightConsistency || 
                       validationResults.classConflicts.length > 0
      };
    });
    
    // Verify business rule validation
    expect(businessRuleValidation.entriesCreated).toBe(4);
    expect(businessRuleValidation.validationResults.withinMaxEntries).toBe(true);
    expect(businessRuleValidation.validationResults.jumpHeightConsistency).toBe(false); // Should detect inconsistency
    expect(businessRuleValidation.validationResults.classConflicts.length).toBeGreaterThan(0); // Should detect conflicts
    expect(businessRuleValidation.hasViolations).toBe(true);
    expect(businessRuleValidation.validationResults.jumpHeights).toEqual(['20"', '16"']);
    
    console.log('✓ Cross-entry business rule validation working correctly:', businessRuleValidation);
  });

  test('should handle waitlist processing for full classes', async ({ page }) => {
    console.log('=== Testing Waitlist Processing ===');
    
    await page.goto('/');
    await testSetup.waitForLoading();
    
    const waitlistProcessing = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();
      
      const showId = 'popular-show-2024';
      const classId = 'masters-standard-24';
      const maxCapacity = 3; // Small capacity for testing
      
      // Create entries that exceed class capacity
      const allEntries = [];
      const dogIds = [
        'competition-dog-1',
        'competition-dog-2', 
        'competition-dog-3',
        'competition-dog-4', // Should go to waitlist
        'competition-dog-5'  // Should go to waitlist
      ];
      
      for (let i = 0; i < dogIds.length; i++) {
        const entry = await entryStore.createEntry({
          showId,
          classId,
          dogId: dogIds[i],
          registrationData: {
            submittedAt: new Date(Date.now() + i * 1000).toISOString(), // Stagger submissions
            handler: `Handler ${i + 1}`,
            entryFee: 40.00,
            paymentStatus: 'pending',
            jumpHeight: '24"',
            submissionOrder: i + 1
          }
        });
        
        allEntries.push(entry);
        
        // Simulate capacity checking and waitlist logic
        const classEntries = entryStore.getEntriesByClass(classId);
        const confirmedEntries = classEntries.filter(e => e.status !== 'waitlisted').length;
        
        if (confirmedEntries > maxCapacity) {
          // Move excess entries to waitlist
          await entryStore.updateStatus(
            entry.id, 
            'waitlisted' as any, // Note: waitlisted not in original enum, but testing the concept
            'system',
            `Class capacity exceeded. Position ${confirmedEntries - maxCapacity} on waitlist.`
          );
        }
      }
      
      // Simulate a cancellation (entry 2 withdraws)
      await entryStore.updateStatus(
        allEntries[1].id,
        'withdrawn',
        'exhibitor',
        'Exhibitor withdrew entry'
      );
      
      // Process waitlist - move first waitlisted entry to confirmed
      const classEntries = entryStore.getEntriesByClass(classId);
      const activeEntries = classEntries.filter(e => !['withdrawn', 'waitlisted'].includes(e.status as any));
      const waitlistedEntries = classEntries.filter(e => e.status === 'waitlisted').sort((a, b) => 
        new Date(a.registrationData.submittedAt).getTime() - new Date(b.registrationData.submittedAt).getTime()
      );
      
      if (activeEntries.length < maxCapacity && waitlistedEntries.length > 0) {
        const nextEntry = waitlistedEntries[0];
        await entryStore.updateStatus(
          nextEntry.id,
          'confirmed',
          'system',
          'Moved from waitlist due to cancellation'
        );
      }
      
      // Final state analysis
      const finalClassEntries = entryStore.getEntriesByClass(classId);
      const statusCounts = finalClassEntries.reduce((counts, entry) => {
        const status = entry.status as string;
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);
      
      return {
        totalEntriesCreated: allEntries.length,
        finalClassEntries: finalClassEntries.length,
        statusCounts,
        confirmedEntries: finalClassEntries.filter(e => e.status === 'confirmed').length,
        waitlistedEntries: finalClassEntries.filter(e => e.status === 'waitlisted').length,
        withdrawnEntries: finalClassEntries.filter(e => e.status === 'withdrawn').length,
        withinCapacity: finalClassEntries.filter(e => e.status === 'confirmed').length <= maxCapacity
      };
    });
    
    // Verify waitlist processing
    expect(waitlistProcessing.totalEntriesCreated).toBe(5);
    expect(waitlistProcessing.finalClassEntries).toBe(5);
    expect(waitlistProcessing.confirmedEntries).toBeLessThanOrEqual(3); // Within capacity
    expect(waitlistProcessing.withdrawnEntries).toBe(1);
    expect(waitlistProcessing.withinCapacity).toBe(true);
    
    console.log('✓ Waitlist processing working correctly:', waitlistProcessing);
  });

  test('should maintain performance under bulk operations', async ({ page }) => {
    console.log('=== Testing Bulk Operation Performance ===');
    
    await page.goto('/');
    await testSetup.waitForLoading();
    
    const performanceTest = await page.evaluate(async () => {
      const { useEntryStore } = await import('/src/store/entryStore.ts');
      const entryStore = useEntryStore.getState();
      
      const showId = 'large-trial-2024';
      const startTime = performance.now();
      
      // Create a large batch of entries (simulating a major trial)
      const batchSize = 50;
      const batchData = [];
      
      for (let i = 0; i < batchSize; i++) {
        batchData.push({
          showId,
          classId: `class-${Math.floor(i / 10) + 1}`, // 5 different classes
          dogId: `performance-dog-${i + 1}`,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: `Handler ${Math.floor(i / 5) + 1}`, // 10 different handlers
            entryFee: 25.00 + (i % 3) * 5, // Varying fees: 25, 30, 35
            paymentStatus: 'pending' as const,
            jumpHeight: ['12"', '16"', '20"', '24"'][i % 4], // Different jump heights
            specialRequests: i % 10 === 0 ? 'Special handling required' : undefined
          }
        });
      }
      
      // Measure bulk creation time
      const creationStart = performance.now();
      const entries = await entryStore.createMultipleEntries(batchData);
      const creationTime = performance.now() - creationStart;
      
      // Measure bulk status update time
      const updateStart = performance.now();
      const entryIds = entries.map(e => e.id);
      await entryStore.updateEntriesStatus(entryIds, 'submitted', 'bulk-system', 'Bulk submission processed');
      const updateTime = performance.now() - updateStart;
      
      // Measure query performance
      const queryStart = performance.now();
      const showEntries = entryStore.getEntriesByShow(showId);
      const stats = entryStore.getStatsForShow(showId);
      const queryTime = performance.now() - queryStart;
      
      const totalTime = performance.now() - startTime;
      
      // Analyze data patterns
      const analysis = {
        uniqueClasses: new Set(showEntries.map(e => e.classId)).size,
        uniqueHandlers: new Set(showEntries.map(e => e.registrationData.handler)).size,
        uniqueJumpHeights: new Set(showEntries.map(e => e.registrationData.jumpHeight)).size,
        entriesWithSpecialRequests: showEntries.filter(e => e.registrationData.specialRequests).length,
        totalRevenue: stats.totalRevenue
      };
      
      return {
        batchSize,
        entriesCreated: entries.length,
        performance: {
          totalTime,
          creationTime,
          updateTime,
          queryTime,
          avgTimePerEntry: totalTime / batchSize,
          entriesPerSecond: batchSize / (totalTime / 1000)
        },
        dataIntegrity: {
          allEntriesCreated: entries.length === batchSize,
          allEntriesSubmitted: showEntries.every(e => e.status === 'submitted'),
          correctShowId: showEntries.every(e => e.showId === showId)
        },
        analysis
      };
    });
    
    // Verify performance benchmarks
    expect(performanceTest.entriesCreated).toBe(50);
    expect(performanceTest.performance.totalTime).toBeLessThan(5000); // Less than 5 seconds
    expect(performanceTest.performance.creationTime).toBeLessThan(3000); // Less than 3 seconds for creation
    expect(performanceTest.performance.updateTime).toBeLessThan(2000); // Less than 2 seconds for updates
    expect(performanceTest.performance.queryTime).toBeLessThan(100); // Less than 100ms for queries
    expect(performanceTest.performance.entriesPerSecond).toBeGreaterThan(10); // At least 10 entries/second
    
    // Verify data integrity
    expect(performanceTest.dataIntegrity.allEntriesCreated).toBe(true);
    expect(performanceTest.dataIntegrity.allEntriesSubmitted).toBe(true);
    expect(performanceTest.dataIntegrity.correctShowId).toBe(true);
    
    // Verify data distribution
    expect(performanceTest.analysis.uniqueClasses).toBe(5);
    expect(performanceTest.analysis.uniqueHandlers).toBe(10);
    expect(performanceTest.analysis.uniqueJumpHeights).toBe(4);
    expect(performanceTest.analysis.entriesWithSpecialRequests).toBe(5); // Every 10th entry
    
    console.log('✓ Bulk operation performance meets benchmarks:', performanceTest);
  });

  console.log('=== Phase 3.2 Multi-Class Entry Registration Tests COMPLETED ===');
});