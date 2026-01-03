/**
 * Development Data Recovery Utility
 * Helps recover data from IndexedDB when localStorage is cleared
 */

export const recoverDataFromIndexedDB = async () => {
  try {
    // Open IndexedDB
    const dbRequest = indexedDB.open('myK9ShowDB');
    
    return new Promise<{clubs: Record<string, unknown>[], shows: Record<string, unknown>[]}>((resolve, reject) => {
      dbRequest.onsuccess = () => {
        const db = dbRequest.result;
        const transaction = db.transaction(['clubs', 'shows'], 'readonly');
        
        const clubsStore = transaction.objectStore('clubs');
        const showsStore = transaction.objectStore('shows');
        
        const clubsRequest = clubsStore.getAll();
        const showsRequest = showsStore.getAll();
        
        let clubsData: Record<string, unknown>[] = [];
        let showsData: Record<string, unknown>[] = [];
        
        clubsRequest.onsuccess = () => {
          clubsData = clubsRequest.result;
          console.log('📊 Recovered clubs from IndexedDB:', clubsData);
        };
        
        showsRequest.onsuccess = () => {
          showsData = showsRequest.result;
          console.log('📊 Recovered shows from IndexedDB:', showsData);
        };
        
        transaction.oncomplete = () => {
          resolve({ clubs: clubsData, shows: showsData });
        };
        
        transaction.onerror = () => {
          reject(transaction.error);
        };
      };
      
      dbRequest.onerror = () => {
        reject(dbRequest.error);
      };
    });
  } catch (error) {
    console.error('Failed to recover data from IndexedDB:', error);
    throw error;
  }
};

// Quick club recreation helper
export const recreateTulsaClub = () => {
  const tulsaClub = {
    id: 'club-tulsa-dog-training',
    name: 'Tulsa Dog Training Club',
    clubNumber: 'TDTC-2024',
    email: 'info@tulsadogtraining.com',
    phone: '(918) 555-0123',
    website: 'https://tulsadogtraining.com',
    description: 'A premier dog training club in Tulsa, Oklahoma, offering comprehensive training programs for dogs of all ages and skill levels.',
    logo: 'https://cdn-icons-png.flaticon.com/512/1076/1076834.png',
    address: {
      street: '1234 Training Way',
      city: 'Tulsa',
      state: 'OK',
      zipCode: '74101',
      country: 'US'
    },
    founded: new Date('2020-01-15'),
    clubType: 'local' as const,
    memberIds: [],
    upcomingShows: [],
    pastShows: [],
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'dev-recovery',
    _syncStatus: 'synced' as const,
    _localOnly: false
  };
  
  return tulsaClub;
};

// Make available in browser console for development
if (typeof window !== 'undefined') {
  (window as unknown as Window & { recoverDataFromIndexedDB: typeof recoverDataFromIndexedDB; recreateTulsaClub: typeof recreateTulsaClub }).recoverDataFromIndexedDB = recoverDataFromIndexedDB;
  (window as unknown as Window & { recoverDataFromIndexedDB: typeof recoverDataFromIndexedDB; recreateTulsaClub: typeof recreateTulsaClub }).recreateTulsaClub = recreateTulsaClub;
}