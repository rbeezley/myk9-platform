// apps/myk9show/src/hooks/useBulkClassOperations.ts
/**
 * useBulkClassOperations — manages class selection state for bulk operations.
 */

import { useState, useCallback } from 'react';

export function useBulkClassOperations() {
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());

  const toggleClass = useCallback((classId: string) => {
    setSelectedClasses(prev => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  }, []);

  const toggleAllInTrial = useCallback((_trialId: string, classIds: string[]) => {
    setSelectedClasses(prev => {
      const allSelected = classIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        classIds.forEach(id => next.delete(id));
      } else {
        classIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((classIds: string[]) => {
    setSelectedClasses(new Set(classIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClasses(new Set());
  }, []);

  return {
    selectedClasses,
    toggleClass,
    toggleAllInTrial,
    selectAll,
    clearSelection,
  };
}
