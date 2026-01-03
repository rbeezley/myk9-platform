import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/services/database/connection';

interface StoreData {
  storeName: string;
  count: number;
  data: unknown[];
}

export const DatabaseViewer: React.FC = () => {
  const [storeData, setStoreData] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(false);

  const stores = useMemo(() => [
    '_zustand_state', 'dogs', 'people', 'shows', 'clubs', 'entries',
    'registrations', 'trials', 'classes', 'competitions', 'results'
  ], []);

  const loadStoreCounts = useCallback(async () => {
    setLoading(true);
    try {
      const data: StoreData[] = [];
      for (const storeName of stores) {
        try {
          const count = await db.instance.count(storeName);
          const storeData = await db.instance.query(storeName, { limit: 5 });
          data.push({ storeName, count, data: storeData });
        } catch (error) {
          console.warn(`Error loading ${storeName}:`, error);
          data.push({ storeName, count: 0, data: [] });
        }
      }
      setStoreData(data);
    } catch (error) {
      console.error('Error loading store data:', error);
    } finally {
      setLoading(false);
    }
  }, [stores]);

  const clearStore = async (storeName: string) => {
    if (confirm(`Clear all data from ${storeName}?`)) {
      try {
        await db.instance.clearStore(storeName);
        await loadStoreCounts();
        alert(`${storeName} cleared successfully`);
      } catch (error) {
        console.error('Error clearing store:', error);
        alert('Error clearing store');
      }
    }
  };

  useEffect(() => {
    loadStoreCounts();
  }, [loadStoreCounts]);

  if (loading) {
    return <div className="p-4">Loading database info...</div>;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">IndexedDB Viewer</h2>
      
      <div className="mb-4">
        <button 
          onClick={loadStoreCounts}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {storeData.map(({ storeName, count, data }) => (
          <div key={storeName} className="border rounded-lg p-4 bg-card">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">{storeName}</h3>
              <span className="text-sm text-muted-foreground">{count} items</span>
            </div>
            
            {count > 0 && (
              <>
                <div className="text-xs text-muted-foreground mb-2">
                  Sample data (first 5):
                </div>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                  {JSON.stringify(data, null, 2)}
                </pre>
                <button 
                  onClick={() => clearStore(storeName)}
                  className="mt-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Clear Store
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};