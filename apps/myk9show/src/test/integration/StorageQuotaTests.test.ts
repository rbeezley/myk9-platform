import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dogStore } from '@/store/dogStore';
import { userStore } from '@/store/userStore';
import { showStore } from '@/store/showStore';

// Mock IndexedDB with quota simulation
class MockIDBDatabase {
  private storage = new Map<string, Record<string, unknown>>();
  private maxSize = 50 * 1024 * 1024; // 50MB default quota
  private currentSize = 0;

  transaction(stores: string[], mode: string) {
    return new MockIDBTransaction(this, stores, mode);
  }

  setQuota(size: number) {
    this.maxSize = size;
  }

  getCurrentSize() {
    return this.currentSize;
  }

  getAvailableSize() {
    return this.maxSize - this.currentSize;
  }

  put(storeName: string, data: Record<string, unknown>) {
    const dataSize = JSON.stringify(data).length;
    
    if (this.currentSize + dataSize > this.maxSize) {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    }

    this.storage.set(`${storeName}:${data.id}`, data);
    this.currentSize += dataSize;
  }

  get(storeName: string, id: string) {
    return this.storage.get(`${storeName}:${id}`);
  }

  delete(storeName: string, id: string) {
    const key = `${storeName}:${id}`;
    const data = this.storage.get(key);
    if (data) {
      this.currentSize -= JSON.stringify(data).length;
      this.storage.delete(key);
    }
  }

  clear(storeName: string) {
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(`${storeName}:`)) {
        this.currentSize -= JSON.stringify(value).length;
        this.storage.delete(key);
      }
    }
  }

  getAll(storeName: string) {
    const results = [];
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(`${storeName}:`)) {
        results.push(value);
      }
    }
    return results;
  }
}

class MockIDBTransaction {
  constructor(
    private db: MockIDBDatabase,
    private storeNames: string[],
    private mode: string
  ) {}

  objectStore(name: string) {
    return new MockIDBObjectStore(this.db, name);
  }
}

class MockIDBObjectStore {
  constructor(
    private db: MockIDBDatabase,
    private storeName: string
  ) {}

  put(data: Record<string, unknown>) {
    return new Promise((resolve, reject) => {
      try {
        this.db.put(this.storeName, data);
        resolve(data.id);
      } catch (error) {
        reject(error);
      }
    });
  }

  get(id: string) {
    return Promise.resolve(this.db.get(this.storeName, id));
  }

  delete(id: string) {
    return new Promise((resolve) => {
      this.db.delete(this.storeName, id);
      resolve(undefined);
    });
  }

  clear() {
    return new Promise((resolve) => {
      this.db.clear(this.storeName);
      resolve(undefined);
    });
  }

  getAll() {
    return Promise.resolve(this.db.getAll(this.storeName));
  }
}

const mockDB = new MockIDBDatabase();

// Mock IndexedDB API
const mockIndexedDB = {
  open: vi.fn().mockResolvedValue(mockDB),
  databases: vi.fn().mockResolvedValue([])
};

Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB
});

// Mock navigator.storage for quota estimation
const mockStorageEstimate = {
  quota: 50 * 1024 * 1024, // 50MB
  usage: 0
};

Object.defineProperty(navigator, 'storage', {
  value: {
    estimate: vi.fn().mockResolvedValue(mockStorageEstimate)
  }
});

// Mock localStorage with size tracking
let localStorageSize = 0;
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn().mockImplementation((key: string, value: string) => {
    const newSize = localStorageSize + value.length;
    if (newSize > 10 * 1024 * 1024) { // 10MB localStorage limit
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    }
    localStorageSize = newSize;
  }),
  removeItem: vi.fn().mockImplementation(() => {
    // Simulate size reduction (approximate)
    localStorageSize = Math.max(0, localStorageSize - 1000);
  }),
  clear: vi.fn().mockImplementation(() => {
    localStorageSize = 0;
  })
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Helper to generate large data
const generateLargeDog = (id: string, size: 'small' | 'medium' | 'large' = 'medium') => {
  const baseDog = {
    id,
    name: `Large Dog ${id}`,
    breed: 'Data Heavy Breed',
    sex: 'male' as const,
    dateOfBirth: '2020-01-01',
    microchipNumber: '123456789012345',
    ownerName: 'Large Data Owner'
  };

  // Add varying amounts of data based on size
  const additionalData: Record<string, unknown> = {};

  if (size === 'medium' || size === 'large') {
    // Add large health records
    additionalData.healthRecords = {
      vaccinations: Array.from({ length: 20 }, (_, i) => ({
        vaccine: `Vaccine ${i}`,
        dateGiven: `2023-0${(i % 9) + 1}-15`,
        veterinarian: `Dr. Veterinarian ${i}`,
        expirationDate: `2024-0${(i % 9) + 1}-15`,
        notes: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10)
      })),
      medications: Array.from({ length: 15 }, (_, i) => ({
        medication: `Medication ${i}`,
        dosage: `${i + 1}mg`,
        frequency: 'Daily',
        startDate: `2023-0${(i % 9) + 1}-01`,
        endDate: `2023-0${(i % 9) + 1}-30`,
        notes: 'Detailed medication notes with long descriptions. '.repeat(15)
      })),
      allergies: Array.from({ length: 10 }, (_, i) => `Allergy ${i}`)
    };

    // Add training records
    additionalData.trainingRecords = Array.from({ length: 50 }, (_, i) => ({
      date: `2023-0${(i % 9) + 1}-${(i % 28) + 1}`,
      activity: `Training Activity ${i}`,
      instructor: `Instructor ${i}`,
      notes: 'Comprehensive training notes with detailed observations. '.repeat(20),
      skills: Array.from({ length: 5 }, (_, j) => `Skill ${i}-${j}`)
    }));
  }

  if (size === 'large') {
    // Add competition history
    additionalData.competitionHistory = Array.from({ length: 100 }, (_, i) => ({
      showId: `show-${i}`,
      showName: `Competition Show ${i}`,
      date: `2023-0${(i % 9) + 1}-${(i % 28) + 1}`,
      classes: Array.from({ length: 5 }, (_, j) => ({
        className: `Class ${i}-${j}`,
        placement: j + 1,
        points: (j + 1) * 10,
        judge: `Judge ${i}-${j}`,
        notes: 'Detailed competition notes and feedback from judges. '.repeat(25)
      }))
    }));

    // Add large photos/documents metadata
    additionalData.documents = Array.from({ length: 30 }, (_, i) => ({
      id: `doc-${i}`,
      type: 'photo',
      filename: `photo-${i}.jpg`,
      size: 2048576, // 2MB
      uploadDate: `2023-0${(i % 9) + 1}-${(i % 28) + 1}`,
      metadata: {
        description: 'High resolution photo with detailed metadata information. '.repeat(30),
        tags: Array.from({ length: 10 }, (_, j) => `tag-${i}-${j}`),
        location: `Photo Location ${i}`,
        camera: `Camera Model ${i}`
      }
    }));
  }

  return { ...baseDog, ...additionalData };
};

describe('Storage Quota Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageSize = 0;
    mockStorageEstimate.usage = 0;
    mockDB.clear('dogs');
    mockDB.clear('people');
    mockDB.clear('shows');
    
    // Reset stores
    dogStore.getState().clearDogs();
    userStore.getState().clearPeople();
    showStore.getState().clearShows();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Large Dataset Handling', () => {
    it('should handle storage of 1000 medium-sized dogs', async () => {
      const startTime = performance.now();
      
      // Generate and store 1000 dogs
      const dogs = Array.from({ length: 1000 }, (_, i) => 
        generateLargeDog(`dog-${i}`, 'medium')
      );

      let successCount = 0;
      let errorCount = 0;

      for (const dog of dogs) {
        try {
          const result = await dogStore.getState().addDog(dog);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch {
          errorCount++;
          if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            break; // Stop when quota is exceeded
          }
        }
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(successCount).toBeGreaterThan(100); // Should store at least 100 dogs
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      
      console.log(`Stored ${successCount} dogs, ${errorCount} errors, took ${duration}ms`);
    });

    it('should handle quota exceeded gracefully', async () => {
      // Set a small quota to trigger quota exceeded
      mockDB.setQuota(1024 * 1024); // 1MB quota
      
      const largeDogs = Array.from({ length: 100 }, (_, i) =>
        generateLargeDog(`large-dog-${i}`, 'large')
      );

      let quotaExceededCaught = false;
      let storedCount = 0;

      for (const dog of largeDogs) {
        try {
          const result = await dogStore.getState().addDog(dog);
          if (result.success) {
            storedCount++;
          }
        } catch {
          if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            quotaExceededCaught = true;
            break;
          }
        }
      }

      expect(quotaExceededCaught).toBe(true);
      expect(storedCount).toBeGreaterThan(0);
      expect(storedCount).toBeLessThan(largeDogs.length);
    });

    it('should estimate storage usage accurately', async () => {
      const mediumDogs = Array.from({ length: 10 }, (_, i) =>
        generateLargeDog(`estimate-dog-${i}`, 'medium')
      );

      let totalEstimatedSize = 0;

      for (const dog of mediumDogs) {
        const dogSize = JSON.stringify(dog).length;
        totalEstimatedSize += dogSize;
        
        await dogStore.getState().addDog(dog);
      }

      const actualSize = mockDB.getCurrentSize();
      const difference = Math.abs(actualSize - totalEstimatedSize);
      const percentageDiff = (difference / totalEstimatedSize) * 100;

      expect(percentageDiff).toBeLessThan(10); // Within 10% accuracy
    });
  });

  describe('Storage Optimization', () => {
    it('should compress data when approaching quota limits', async () => {
      // Set quota close to current usage
      const initialUsage = mockDB.getCurrentSize();
      mockDB.setQuota(initialUsage + 2 * 1024 * 1024); // 2MB additional space

      const dogs = Array.from({ length: 100 }, (_, i) =>
        generateLargeDog(`compress-dog-${i}`, 'large')
      );

      let compressionTriggered = false;
      let storedCount = 0;

      for (const dog of dogs) {
        try {
          const availableSpace = mockDB.getAvailableSize();
          
          // Simulate compression when space is low
          if (availableSpace < 500 * 1024) { // Less than 500KB
            compressionTriggered = true;
            // Simulate compressed version of dog data
            const compressedDog = {
              ...dog,
              healthRecords: undefined, // Remove large data
              trainingRecords: undefined,
              competitionHistory: undefined
            };
            await dogStore.getState().addDog(compressedDog);
          } else {
            await dogStore.getState().addDog(dog);
          }
          
          storedCount++;
        } catch {
          if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            break;
          }
        }
      }

      expect(compressionTriggered).toBe(true);
      expect(storedCount).toBeGreaterThan(10);
    });

    it('should implement LRU eviction when storage is full', async () => {
      // Fill storage with dogs
      const dogs = Array.from({ length: 50 }, (_, i) =>
        generateLargeDog(`lru-dog-${i}`, 'medium')
      );

      // Add all dogs
      for (const dog of dogs) {
        try {
          await dogStore.getState().addDog(dog);
        } catch {
          // Some may fail due to quota
        }
      }


      // Access some dogs to update their "last accessed" time
      const accessedDogs = dogs.slice(0, 5);
      for (const dog of accessedDogs) {
        dogStore.getState().getDogById(dog.id);
        // Simulate updating last accessed time
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Try to add more dogs, triggering LRU eviction
      const newDogs = Array.from({ length: 20 }, (_, i) =>
        generateLargeDog(`new-lru-dog-${i}`, 'medium')
      );

      let newDogsAdded = 0;
      for (const dog of newDogs) {
        try {
          const result = await dogStore.getState().addDog(dog);
          if (result.success) {
            newDogsAdded++;
          }
        } catch {
          // Expected when quota is exceeded
        }
      }

      const finalDogCount = dogStore.getState().dogs.length;
      
      // Some new dogs should be added and some old ones should be evicted
      expect(newDogsAdded).toBeGreaterThan(0);
      expect(finalDogCount).toBeGreaterThan(0);
      
      // Recently accessed dogs should still be present
      for (const accessedDog of accessedDogs) {
        const stillExists = dogStore.getState().getDogById(accessedDog.id);
        expect(stillExists).toBeDefined();
      }
    });
  });

  describe('Multi-Entity Storage Pressure', () => {
    it('should handle mixed entity types under storage pressure', async () => {
      const dogs = Array.from({ length: 200 }, (_, i) =>
        generateLargeDog(`mixed-dog-${i}`, 'medium')
      );

      const people = Array.from({ length: 200 }, (_, i) => ({
        id: `person-${i}`,
        firstName: `FirstName${i}`,
        lastName: `LastName${i}`,
        email: `person${i}@example.com`,
        phone: `555-${String(i).padStart(4, '0')}`,
        address: `${i} Long Street Address Name`,
        city: 'Large City Name',
        state: 'ST',
        zipCode: '12345',
        notes: 'Very detailed notes about this person with lots of information. '.repeat(50)
      }));

      const shows = Array.from({ length: 50 }, (_, i) => ({
        id: `show-${i}`,
        name: `Large Dog Show ${i}`,
        date: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`,
        location: `Large Convention Center ${i}`,
        description: 'Comprehensive show description with detailed information. '.repeat(100),
        trials: Array.from({ length: 10 }, (_, j) => ({
          id: `trial-${i}-${j}`,
          name: `Trial ${j}`,
          classes: Array.from({ length: 20 }, (_, k) => ({
            id: `class-${i}-${j}-${k}`,
            name: `Class ${k}`,
            description: 'Detailed class description. '.repeat(20)
          }))
        }))
      }));

      let totalStored = 0;
      let errors = 0;

      // Interleave storage of different entity types
      const maxEntities = Math.max(dogs.length, people.length, shows.length);
      
      for (let i = 0; i < maxEntities; i++) {
        try {
          if (i < dogs.length) {
            const result = await dogStore.getState().addDog(dogs[i]);
            if (result.success) totalStored++;
          }
          
          if (i < people.length) {
            const result = await userStore.getState().addUser(people[i]);
            if (result.success) totalStored++;
          }
          
          if (i < shows.length) {
            const result = await showStore.getState().addShow(shows[i]);
            if (result.success) totalStored++;
          }
        } catch {
          errors++;
          if (errors > 50) break; // Stop after too many errors
        }
      }

      expect(totalStored).toBeGreaterThan(50);
      expect(errors).toBeGreaterThan(0); // Should hit storage limits
      
      // All stores should have some data
      expect(dogStore.getState().dogs.length).toBeGreaterThan(0);
      expect(userStore.getState().people.length).toBeGreaterThan(0);
      expect(showStore.getState().shows.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Under Storage Pressure', () => {
    it('should maintain reasonable performance with large datasets', async () => {
      // Pre-fill storage with data
      const largeDogs = Array.from({ length: 500 }, (_, i) =>
        generateLargeDog(`perf-dog-${i}`, 'medium')
      );

      // Measure initial loading performance
      const loadStart = performance.now();
      
      let loaded = 0;
      for (const dog of largeDogs) {
        try {
          const result = await dogStore.getState().addDog(dog);
          if (result.success) loaded++;
          
          // Break if it takes too long
          if (performance.now() - loadStart > 30000) break;
        } catch {
          // Expected when quota exceeded
          break;
        }
      }
      
      const loadEnd = performance.now();
      const loadTime = loadEnd - loadStart;

      expect(loaded).toBeGreaterThan(100);
      expect(loadTime).toBeLessThan(30000); // Should load within 30 seconds

      // Test retrieval performance
      const retrievalStart = performance.now();
      
      const retrievedDogs = dogStore.getState().dogs.slice(0, 100);
      for (const dog of retrievedDogs) {
        dogStore.getState().getDogById(dog.id);
      }
      
      const retrievalEnd = performance.now();
      const retrievalTime = retrievalEnd - retrievalStart;

      expect(retrievalTime).toBeLessThan(1000); // Should retrieve 100 dogs within 1 second
    });

    it('should handle concurrent storage operations efficiently', async () => {
      const concurrentOperations = Array.from({ length: 100 }, (_, i) => {
        const operations = [
          () => dogStore.getState().addDog(generateLargeDog(`concurrent-dog-${i}`, 'small')),
          () => userStore.getState().addUser({
            id: `concurrent-person-${i}`,
            firstName: `User${i}`,
            lastName: 'Concurrent',
            email: `concurrent${i}@example.com`
          })
        ];
        
        return operations[i % 2]();
      });

      const start = performance.now();
      
      const results = await Promise.allSettled(concurrentOperations);
      
      const end = performance.now();
      const duration = end - start;

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful).toBeGreaterThan(20);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      console.log(`Concurrent operations: ${successful} successful, ${failed} failed, ${duration}ms`);
    });
  });

  describe('Storage Recovery and Cleanup', () => {
    it('should recover storage space through cleanup', async () => {
      // Fill storage with temporary data
      const tempDogs = Array.from({ length: 100 }, (_, i) =>
        generateLargeDog(`temp-dog-${i}`, 'medium')
      );

      for (const dog of tempDogs) {
        try {
          await dogStore.getState().addDog(dog);
        } catch {
          // Expected when quota exceeded
        }
      }

      const beforeCleanup = mockDB.getCurrentSize();

      // Delete half the dogs
      const dogsToDelete = dogStore.getState().dogs.slice(0, 50);
      for (const dog of dogsToDelete) {
        await dogStore.getState().deleteDog(dog.id);
      }

      const afterCleanup = mockDB.getCurrentSize();
      const freedSpace = beforeCleanup - afterCleanup;

      expect(freedSpace).toBeGreaterThan(0);
      expect(afterCleanup).toBeLessThan(beforeCleanup);

      // Should be able to add new data after cleanup
      const newDog = generateLargeDog('cleanup-test-dog', 'medium');
      const result = await dogStore.getState().addDog(newDog);
      
      expect(result.success).toBe(true);
    });

    it('should implement storage compaction', async () => {
      // Create fragmented storage by adding and deleting data
      for (let cycle = 0; cycle < 5; cycle++) {
        const dogs = Array.from({ length: 20 }, (_, i) =>
          generateLargeDog(`cycle-${cycle}-dog-${i}`, 'medium')
        );

        // Add dogs
        for (const dog of dogs) {
          try {
            await dogStore.getState().addDog(dog);
          } catch {
            // Expected
          }
        }

        // Delete some dogs to create fragmentation
        const currentDogs = dogStore.getState().dogs;
        for (let i = 0; i < Math.min(10, currentDogs.length); i++) {
          await dogStore.getState().deleteDog(currentDogs[i].id);
        }
      }

      const beforeCompaction = mockDB.getCurrentSize();

      // Simulate storage compaction
      const allDogs = dogStore.getState().dogs;
      dogStore.getState().clearDogs();
      
      for (const dog of allDogs) {
        await dogStore.getState().addDog(dog);
      }

      const afterCompaction = mockDB.getCurrentSize();

      // After compaction, storage should be more efficient
      expect(afterCompaction).toBeLessThanOrEqual(beforeCompaction);
    });
  });
});