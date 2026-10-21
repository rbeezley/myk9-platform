import { useEffect, useRef } from 'react';

/**
 * Sets the tab title while mounted and restores the title that was there BEFORE the first set on
 * unmount. The original is captured once: a show renamed while mounted re-runs the effect, and
 * restoring the previous run's title would leave the tab on the old show name.
 */
export function useDocumentTitle(title: string): void {
  const original = useRef<string | null>(null);
  useEffect(() => {
    if (original.current === null) original.current = document.title;
    document.title = title;
  }, [title]);
  useEffect(() => {
    return () => {
      if (original.current !== null) document.title = original.current;
    };
  }, []);
}
