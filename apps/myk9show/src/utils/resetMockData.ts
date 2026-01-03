/**
 * Utility to reset all mock data and clear localStorage
 */

export const resetAllMockData = () => {
  // Clear all localStorage keys used by Zustand stores
  const keysToRemove = [
    'dog-storage',
    'user-storage',
    'myk9show-user-storage', // Updated people storage key
    'show-storage',
    'club-storage',
    'health-storage',
    'training-storage',
    'template-storage',
    'class-template-storage',
    'show-template-storage',
    'class-creation-storage',
    'sidebar-storage'
  ];

  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });

  // Force page reload to reinitialize stores with fresh mock data
  window.location.reload();
};

export const resetSpecificStore = (storeName: string) => {
  const storeKeys: Record<string, string> = {
    dogs: 'dog-storage',
    people: 'myk9show-user-storage', // Updated people storage key
    shows: 'show-storage', 
    clubs: 'club-storage',
    health: 'health-storage',
    training: 'training-storage',
    templates: 'template-storage',
    classTemplates: 'class-template-storage',
    showTemplates: 'show-template-storage',
    sidebar: 'sidebar-storage'
  };

  const key = storeKeys[storeName];
  if (key) {
    localStorage.removeItem(key);
    console.log(`Reset ${storeName} store`);
  }
};