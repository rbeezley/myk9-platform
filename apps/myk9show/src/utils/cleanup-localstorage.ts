// One-time cleanup to remove old localStorage data
export function cleanupOldLocalStorage() {
  const storageKeys = [
    'template-storage',
    'myk9show-template-storage',
    'template-store',
    'templates'
  ];
  
  storageKeys.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
    }
  });
  
  // Mark cleanup as done
  localStorage.setItem('template-storage-cleanup-v1', 'done');
}

// Run cleanup if not already done
export function runTemplateStorageCleanup(): void {
  if (!localStorage.getItem('template-storage-cleanup-v1')) {
    cleanupOldLocalStorage();
  }
}