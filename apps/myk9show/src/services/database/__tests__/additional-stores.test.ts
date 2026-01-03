// Additional store integration tests for Phase 2 completion
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB for testing
global.indexedDB = new FDBFactory();
global.IDBKeyRange = FDBKeyRange;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_ENABLE_INDEXEDDB: 'false', // Test localStorage fallback
    VITE_INDEXEDDB_VERSION: '1',
    VITE_ENABLE_STORAGE_LOGGING: 'true'
  }
});

describe('Phase 2 Additional Stores Integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  describe('EntryStore Migration', () => {
    it('should import entryStore with IndexedDB support', async () => {
      const entryStore = await import('@/store/entryStore');
      expect(entryStore.useEntryStore).toBeDefined();
    });

    it('should handle entry store operations', async () => {
      const { getOptimalStorage } = await import('../storage-adapter');
      const storage = getOptimalStorage('entries');
      
      // Test entry data
      const entryData = {
        entries: [
          {
            id: 'entry-1',
            showId: 'show-1', 
            classId: 'class-1',
            dogId: 'dog-1',
            status: 'submitted',
            registrationData: {
              submittedAt: new Date().toISOString(),
              handler: 'John Doe',
              entryFee: 25,
              paymentStatus: 'paid'
            },
            statusHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      };
      
      await storage.setItem('entry-test', JSON.stringify(entryData));
      const retrieved = await storage.getItem('entry-test');
      expect(JSON.parse(retrieved!)).toEqual(entryData);
    });
  });

  describe('ClassStore Migration', () => {
    it('should import classStore with IndexedDB support', async () => {
      const classStore = await import('@/store/classStore');
      expect(classStore.useClassStore).toBeDefined();
    });

    it('should handle class store operations', async () => {
      const { getOptimalStorage } = await import('../storage-adapter');
      const storage = getOptimalStorage('classes');
      
      // Test class data
      const classData = {
        classes: [
          {
            id: 'class-1',
            trialId: 'trial-1',
            className: 'Novice Agility',
            entryFee: 25,
            status: 'Scheduled'
          }
        ],
        entries: [],
        selectedClassId: 'class-1'
      };
      
      await storage.setItem('class-test', JSON.stringify(classData));
      const retrieved = await storage.getItem('class-test');
      expect(JSON.parse(retrieved!)).toEqual(classData);
    });
  });

  describe('TrialStore Migration', () => {
    it('should import trialStore with IndexedDB support', async () => {
      const trialStore = await import('@/store/trialStore');
      expect(trialStore.useTrialStore).toBeDefined();
    });

    it('should handle trial store operations', async () => {
      const { getOptimalStorage } = await import('../storage-adapter');
      const storage = getOptimalStorage('trials');
      
      // Test trial data
      const trialData = {
        trials: [
          {
            id: 'trial-1',
            showId: 'show-1',
            name: 'Agility Trial',
            trialDate: '2025-07-20',
            status: 'Upcoming',
            type: 'Standard'
          }
        ],
        selectedTrialId: 'trial-1',
        trialClasses: {}
      };
      
      await storage.setItem('trial-test', JSON.stringify(trialData));
      const retrieved = await storage.getItem('trial-test');
      expect(JSON.parse(retrieved!)).toEqual(trialData);
    });
  });

  describe('All Core Stores Complete', () => {
    it('should import all Phase 2 stores successfully', async () => {
      const stores = await Promise.all([
        import('@/store/userStore'),
        import('@/store/clubStore'),
        import('@/store/dogStore'), 
        import('@/store/showStore'),
        import('@/store/entryStore'),
        import('@/store/classStore'),
        import('@/store/trialStore')
      ]);
      
      expect(stores).toHaveLength(7);
      stores.forEach(store => {
        expect(store).toBeDefined();
      });
    });

    it('should have all stores using optimal storage', async () => {
      // This test verifies that all stores would use the same storage adapter
      const { getOptimalStorage } = await import('../storage-adapter');
      
      const storageTypes = [
        'people', 'clubs', 'dogs', 'shows', 
        'entries', 'classes', 'trials'
      ];
      
      storageTypes.forEach(storeName => {
        const storage = getOptimalStorage(storeName);
        expect(storage).toBeDefined();
        expect(storage.getItem).toBeDefined();
        expect(storage.setItem).toBeDefined();
        expect(storage.removeItem).toBeDefined();
      });
    });

    it('should handle complex relational data', async () => {
      const { getOptimalStorage } = await import('../storage-adapter');
      const storage = getOptimalStorage('test');
      
      // Test complex relationship data
      const relationshipData = {
        dog: { id: 'dog-1', ownerId: 'person-1' },
        person: { id: 'person-1', name: 'John Doe' },
        show: { id: 'show-1', clubId: 'club-1' },
        club: { id: 'club-1', name: 'Test Club' },
        trial: { id: 'trial-1', showId: 'show-1' },
        class: { id: 'class-1', trialId: 'trial-1' },
        entry: { 
          id: 'entry-1', 
          dogId: 'dog-1', 
          showId: 'show-1', 
          classId: 'class-1' 
        }
      };
      
      await storage.setItem('relationship-test', JSON.stringify(relationshipData));
      const retrieved = await storage.getItem('relationship-test');
      expect(JSON.parse(retrieved!)).toEqual(relationshipData);
    });
  });
});