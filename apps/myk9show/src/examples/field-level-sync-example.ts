/**
 * Field-Level Sync Service Usage Examples
 * 
 * This file demonstrates how to use the FieldLevelSyncService for optimal
 * bandwidth usage and granular data synchronization.
 */

import { fieldLevelSync } from '../services/sync/FieldLevelSyncService';

// Example 1: Basic field tracking and sync
async function basicFieldSync() {
  console.log('=== Basic Field Sync Example ===');
  
  // Track changes to specific fields
  fieldLevelSync.trackFieldChange({
    entityType: 'dogs',
    entityId: 'dog-123',
    fieldName: 'name',
    oldValue: 'Buddy',
    newValue: 'Max',
    timestamp: Date.now(),
    userId: 'user-456',
    deviceId: 'device-789'
  });

  fieldLevelSync.trackFieldChange({
    entityType: 'dogs',
    entityId: 'dog-123',
    fieldName: 'lastVisit',
    oldValue: '2024-01-01',
    newValue: '2024-01-15',
    timestamp: Date.now(),
    userId: 'user-456',
    deviceId: 'device-789'
  });

  // The full entity
  const dogEntity = {
    id: 'dog-123',
    name: 'Max',
    breed: 'Golden Retriever',
    age: 3,
    weight: 70,
    lastVisit: '2024-01-15',
    medicalHistory: 'Large medical history text...', // Won't sync unless changed
    photos: ['photo1.jpg', 'photo2.jpg'], // Won't sync unless changed
    vaccinations: [/* Array of vaccination records */]
  };

  // Sync only changed fields
  const result = await fieldLevelSync.syncChangedFields('dogs', 'dog-123', dogEntity);
  
  console.log('Sync Result:', {
    syncedFields: result.syncedFields,
    skippedFields: result.skippedFields,
    bytesTransferred: result.bytesTransferred,
    bytesSaved: result.bytesSaved,
    compressionRatio: result.compressionRatio
  });
}

// Example 2: Using sync scopes for different scenarios
async function syncScopesExample() {
  console.log('\n=== Sync Scopes Example ===');
  
  const showEntity = {
    id: 'show-001',
    title: 'National Dog Show 2024',
    date: '2024-06-15',
    location: 'Convention Center',
    description: 'Annual national championship...',
    rules: 'Detailed competition rules document...',
    schedule: {/* Complex schedule object */},
    sponsors: ['Sponsor1', 'Sponsor2'],
    registrations: [/* Array of registrations */],
    results: [/* Array of results */],
    photos: ['banner.jpg', 'venue.jpg'],
    documents: ['rules.pdf', 'schedule.pdf']
  };

  // Track some changes
  fieldLevelSync.trackFieldChange({
    entityType: 'shows',
    entityId: 'show-001',
    fieldName: 'registrations',
    oldValue: [],
    newValue: showEntity.registrations,
    timestamp: Date.now(),
    userId: 'admin-001',
    deviceId: 'desktop-001'
  });

  // Minimal sync - only essential fields
  console.log('Minimal Scope:');
  const minimalResult = await fieldLevelSync.syncChangedFields(
    'shows', 
    'show-001', 
    showEntity,
    { syncScope: 'minimal' }
  );
  console.log(`  Synced: ${minimalResult.syncedFields.join(', ')}`);
  console.log(`  Bytes: ${minimalResult.bytesTransferred}`);

  // Mobile sync - optimized for mobile devices
  console.log('\nMobile Scope:');
  const mobileResult = await fieldLevelSync.syncChangedFields(
    'shows',
    'show-001',
    showEntity,
    { syncScope: 'mobile' }
  );
  console.log(`  Synced: ${mobileResult.syncedFields.join(', ')}`);
  console.log(`  Bytes: ${mobileResult.bytesTransferred}`);

  // Full sync - all fields
  console.log('\nFull Scope:');
  const fullResult = await fieldLevelSync.syncChangedFields(
    'shows',
    'show-001',
    showEntity,
    { syncScope: 'full' }
  );
  console.log(`  Synced: ${fullResult.syncedFields.join(', ')}`);
  console.log(`  Bytes: ${fullResult.bytesTransferred}`);
}

// Example 3: Custom field configuration
async function customFieldConfiguration() {
  console.log('\n=== Custom Field Configuration Example ===');
  
  const personEntity = {
    id: 'person-001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '555-1234',
    address: '123 Main St',
    profilePhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...', // Large base64 image
    credentials: {
      judgeNumber: 'J12345',
      certifications: ['AKC', 'UKC']
    },
    privateNotes: 'Confidential information...',
    publicBio: 'Experienced dog show judge...'
  };

  // Track changes to public fields
  ['firstName', 'email', 'publicBio'].forEach(field => {
    fieldLevelSync.trackFieldChange({
      entityType: 'people',
      entityId: 'person-001',
      fieldName: field,
      oldValue: null,
      newValue: personEntity[field as keyof typeof personEntity],
      timestamp: Date.now(),
      userId: 'user-001',
      deviceId: 'mobile-001'
    });
  });

  // Sync with custom configuration
  const result = await fieldLevelSync.syncChangedFields(
    'people',
    'person-001',
    personEntity,
    {
      includedFields: ['id', 'firstName', 'lastName', 'email', 'publicBio'],
      excludedFields: ['privateNotes', 'profilePhoto'],
      compressionThreshold: 500, // Compress fields larger than 500 bytes
      syncScope: 'custom'
    }
  );

  console.log('Custom Sync Result:', {
    synced: result.syncedFields,
    skipped: result.skippedFields,
    bandwidth: `${result.bytesTransferred} bytes (saved ${result.bytesSaved} bytes)`
  });
}

// Example 4: Creating custom sync scopes
async function createCustomSyncScope() {
  console.log('\n=== Custom Sync Scope Creation Example ===');
  
  // Create a scope for judges during competitions
  fieldLevelSync.createSyncScope('judge-competition', {
    description: 'Optimized scope for judges during active competitions',
    includedFields: new Set([
      'id', 'entryNumber', 'dogName', 'handlerName',
      'classId', 'scoreStatus', 'placement', 'timeScore'
    ]),
    excludedFields: new Set([
      'photos', 'documents', 'detailedHistory', 
      'medicalRecords', 'trainingNotes'
    ]),
    priorityFields: new Set([
      'id', 'scoreStatus', 'placement'
    ]),
    conditions: {
      userRole: ['judge', 'steward'],
      timeOfDay: { start: 8, end: 18 } // Active during competition hours
    }
  });

  // Create a scope for offline scoring
  fieldLevelSync.createSyncScope('offline-scoring', {
    description: 'Minimal data for offline scoring capability',
    includedFields: new Set([
      'id', 'entryNumber', 'dogId', 'classId',
      'runOrder', 'checkInStatus', 'scoreFields'
    ]),
    excludedFields: new Set([
      'photos', 'videos', 'historicalData', 'analytics'
    ]),
    priorityFields: new Set([
      'id', 'runOrder', 'checkInStatus'
    ]),
    conditions: {
      networkType: ['offline', 'slow-2g']
    }
  });

  // Use the custom scope
  const entry = {
    id: 'entry-001',
    entryNumber: '101',
    dogName: 'Max',
    handlerName: 'John Doe',
    classId: 'class-001',
    scoreStatus: 'pending',
    placement: null,
    timeScore: null,
    photos: ['action1.jpg', 'action2.jpg'],
    documents: ['registration.pdf'],
    detailedHistory: 'Previous competition results...'
  };

  fieldLevelSync.trackFieldChange({
    entityType: 'entries',
    entityId: 'entry-001',
    fieldName: 'scoreStatus',
    oldValue: 'pending',
    newValue: 'scored',
    timestamp: Date.now(),
    userId: 'judge-001',
    deviceId: 'tablet-001'
  });

  const result = await fieldLevelSync.syncChangedFields(
    'entries',
    'entry-001',
    entry,
    { syncScope: 'judge-competition' }
  );

  console.log('Judge Competition Scope Result:', {
    synced: result.syncedFields,
    bandwidth: result.bytesTransferred
  });
}

// Example 5: Monitoring field access patterns
async function monitorAccessPatterns() {
  console.log('\n=== Access Pattern Monitoring Example ===');
  
  // Simulate realistic access patterns
  const accessSimulation = [
    { field: 'status', type: 'read', count: 50 },
    { field: 'status', type: 'write', count: 10 },
    { field: 'name', type: 'read', count: 30 },
    { field: 'name', type: 'write', count: 2 },
    { field: 'results', type: 'read', count: 15 },
    { field: 'results', type: 'write', count: 5 },
    { field: 'analytics', type: 'read', count: 2 },
    { field: 'fullHistory', type: 'read', count: 1 }
  ];

  // Track the accesses
  accessSimulation.forEach(({ field, type, count }) => {
    for (let i = 0; i < count; i++) {
      fieldLevelSync.trackFieldAccess('shows', field, type as 'read' | 'write');
    }
  });

  // Get access patterns
  const patterns = fieldLevelSync.getAccessPatterns('shows');
  console.log('Field Access Patterns:');
  
  patterns.forEach((pattern, fieldName) => {
    console.log(`  ${fieldName}:`);
    console.log(`    Total accesses: ${pattern.accessCount}`);
    console.log(`    Read/Write ratio: ${(pattern.readCount / pattern.writeCount).toFixed(2)}`);
    console.log(`    Access frequency: High=${pattern.accessCount > 20}`);
  });

  // Get optimization recommendations
  const recommendations = fieldLevelSync.getOptimizationRecommendations('shows');
  console.log('\nOptimization Recommendations:');
  recommendations.forEach(rec => console.log(`  - ${rec}`));
}

// Example 6: Bandwidth usage reporting
async function bandwidthReporting() {
  console.log('\n=== Bandwidth Usage Reporting Example ===');
  
  // Simulate syncing various fields with different sizes
  const testData = [
    {
      entity: { id: '1', smallField: 'test', largeField: 'A'.repeat(5000) },
      changes: ['smallField', 'largeField']
    },
    {
      entity: { id: '2', name: 'Test', data: { nested: Array(100).fill('data') } },
      changes: ['name', 'data']
    },
    {
      entity: { 
        id: '3', 
        image: 'data:image/jpeg;base64,' + 'A'.repeat(20000),
        thumbnail: 'data:image/jpeg;base64,' + 'A'.repeat(2000)
      },
      changes: ['image', 'thumbnail']
    }
  ];

  // Perform syncs
  for (const { entity, changes } of testData) {
    changes.forEach(field => {
      fieldLevelSync.trackFieldChange({
        entityType: 'test-entities',
        entityId: entity.id,
        fieldName: field,
        oldValue: null,
        newValue: entity[field as keyof typeof entity],
        timestamp: Date.now(),
        userId: 'test-user',
        deviceId: 'test-device'
      });
    });

    await fieldLevelSync.syncChangedFields('test-entities', entity.id, entity);
  }

  // Get bandwidth report
  const report = fieldLevelSync.getBandwidthReport('test-entities');
  console.log('Bandwidth Usage Report:');
  
  let totalBytes = 0;
  let totalSyncs = 0;
  
  report.forEach((usage, key) => {
    console.log(`  ${key}:`);
    console.log(`    Bytes transferred: ${usage.bytesTransferred}`);
    console.log(`    Sync count: ${usage.syncCount}`);
    console.log(`    Average size: ${usage.averageSize.toFixed(2)} bytes`);
    
    totalBytes += usage.bytesTransferred;
    totalSyncs += usage.syncCount;
  });
  
  console.log(`\n  Total bandwidth used: ${totalBytes} bytes`);
  console.log(`  Total syncs performed: ${totalSyncs}`);
}

// Example 7: Handling large binary fields
async function largeBinaryFieldHandling() {
  console.log('\n=== Large Binary Field Handling Example ===');
  
  // Configure for binary optimization
  fieldLevelSync.configure({
    compressionThreshold: 1024, // 1KB
    largeFieldThreshold: 10240, // 10KB
    bandwidthLimit: 1048576 // 1MB per sync
  });

  const document = {
    id: 'doc-001',
    title: 'Competition Rules 2024',
    type: 'pdf',
    size: 2500000, // 2.5MB
    content: 'data:application/pdf;base64,' + 'A'.repeat(2500000),
    thumbnail: 'data:image/png;base64,' + 'A'.repeat(5000),
    metadata: {
      author: 'Show Committee',
      created: '2024-01-01',
      pages: 45
    }
  };

  // Track the large content change
  fieldLevelSync.trackFieldChange({
    entityType: 'documents',
    entityId: 'doc-001',
    fieldName: 'content',
    oldValue: null,
    newValue: document.content,
    timestamp: Date.now(),
    userId: 'admin-001',
    deviceId: 'desktop-001'
  });

  // Sync with bandwidth awareness
  console.log('Syncing large document...');
  const result = await fieldLevelSync.syncChangedFields(
    'documents',
    'doc-001',
    document,
    {
      includedFields: ['id', 'title', 'type', 'thumbnail', 'metadata'],
      excludedFields: ['content'], // Exclude the large content field
      syncScope: 'custom'
    }
  );

  console.log('Large Document Sync Result:');
  console.log(`  Synced fields: ${result.syncedFields.join(', ')}`);
  console.log(`  Skipped: ${result.skippedFields.join(', ')}`);
  console.log(`  Bytes transferred: ${result.bytesTransferred}`);
  console.log(`  Bandwidth saved by excluding content: ~${document.size} bytes`);
}

// Run all examples
async function runAllExamples() {
  try {
    await basicFieldSync();
    await syncScopesExample();
    await customFieldConfiguration();
    await createCustomSyncScope();
    await monitorAccessPatterns();
    await bandwidthReporting();
    await largeBinaryFieldHandling();
    
    console.log('\n=== All examples completed successfully! ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export for use in other modules
export {
  basicFieldSync,
  syncScopesExample,
  customFieldConfiguration,
  createCustomSyncScope,
  monitorAccessPatterns,
  bandwidthReporting,
  largeBinaryFieldHandling,
  runAllExamples
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}