/**
 * Debug utilities for search functionality
 */

import { globalSearchIndex, createSearchableItem } from './searchIndex';

export function debugSearchIndex() {
  const stats = globalSearchIndex.getStats();
  console.log('=== Search Index Debug ===');
  console.log('Stats:', stats);
  
  // Try to find Cooper specifically
  const cooperResults = globalSearchIndex.search('cooper', { maxResults: 10, minScore: 0.1 });
  console.log('Cooper search results:', cooperResults);
  
  const coopResults = globalSearchIndex.search('coop', { maxResults: 10, minScore: 0.1 });
  console.log('Coop search results:', coopResults);
  
  return { stats, cooperResults, coopResults };
}

export function debugDogData(dogs: Array<{ id: string; name?: string; callName?: string }>) {
  console.log('=== Dog Data Debug ===');
  const cooperDog = dogs.find(dog => dog.callName?.toLowerCase() === 'cooper' || dog.name?.toLowerCase().includes('cooper'));
  
  if (cooperDog) {
    console.log('Found Cooper dog:', cooperDog);
    
    // Test creating searchable item
    const searchableCooper = createSearchableItem('dog', cooperDog);
    console.log('Searchable Cooper:', searchableCooper);
  } else {
    console.log('Cooper dog not found in dogs array');
    console.log('Available dogs:', dogs.map(d => ({ id: d.id, name: d.name, callName: d.callName })));
  }
}

// Add to window for browser console debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).debugSearch = {
    debugSearchIndex,
    debugDogData,
    globalSearchIndex
  };
}