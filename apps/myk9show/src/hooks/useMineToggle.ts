import { useState, useCallback } from 'react';

const STORAGE_PREFIX = 'myk9-mine-toggle-';

export function useMineToggle(entityType: string, defaultMine = false) {
  const storageKey = `${STORAGE_PREFIX}${entityType}`;

  const [isMine, setIsMine] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === 'true';
    return defaultMine;
  });

  const toggle = useCallback(() => {
    setIsMine(prev => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  const setMine = useCallback(
    (value: boolean) => {
      setIsMine(value);
      localStorage.setItem(storageKey, String(value));
    },
    [storageKey]
  );

  return { isMine, toggle, setMine };
}
