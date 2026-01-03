/**
 * Utility to clear localStorage for myK9Show
 * Run this in the browser console or call from a component
 */
export const clearMyK9ShowStorage = () => {
  const storageKeys = [
    'myk9show-shows-storage',
    'myk9show-trials-storage',
    'myk9show-dogs-storage',
    'myk9show-user-storage',
    'myk9show-clubs-storage',
    'myk9show-classes-storage',
    'template-storage',
    'class-template-storage',
    'show-template-storage'
  ];

  storageKeys.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      console.log(`✓ Cleared ${key}`);
    }
  });

  console.log('All myK9Show storage cleared. Please refresh the page to load mock data.');
};

// For direct browser console use:
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).clearMyK9ShowStorage = clearMyK9ShowStorage;
}