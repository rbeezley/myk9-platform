import { useCallback, useEffect, useRef, useState } from 'react';

export interface FieldLocation<TTab extends string> {
  tab: TTab;
  /** DOM id to focus once the tab is showing, so the move is announced. */
  elementId: string;
}

/**
 * Tab state for a tabbed edit panel plus the `onValidationFail` handler that
 * moves a failed save to the tab holding the first invalid field and focuses
 * it (MYK9-885 Add Dog, MYK9-891 Create Club). Each panel supplies only its own
 * field -> tab/element map. The state lives in the panel (not the tab content)
 * so the wrapper's `onValidationFail` can reach it.
 */
export function usePanelValidationNavigation<TTab extends string>(
  initialTab: TTab,
  locate: (field: string) => FieldLocation<TTab> | undefined
) {
  const [activeTab, setActiveTab] = useState<TTab>(initialTab);

  // Set alongside the tab switch; the effect below focuses the target once the
  // tab has rendered (handledFocusRef marks it done). A fresh object per
  // failure so the same field failing twice re-focuses.
  const [pendingFocus, setPendingFocus] = useState<{ elementId: string } | null>(null);
  const handledFocusRef = useRef<typeof pendingFocus>(null);

  const handleValidationFail = useCallback(
    (firstErrorField: string) => {
      const location = locate(firstErrorField);
      if (!location) return;
      setActiveTab(location.tab);
      setPendingFocus({ elementId: location.elementId });
    },
    [locate]
  );

  useEffect(() => {
    if (!pendingFocus || handledFocusRef.current === pendingFocus) return;
    handledFocusRef.current = pendingFocus;
    const focusTarget = () => {
      const el = document.getElementById(pendingFocus.elementId);
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    };
    focusTarget();
    // In the dialog variant the focus manager re-focuses the previously
    // focused control on the next animation frame; focus again after it so the
    // field keeps focus.
    const raf = requestAnimationFrame(focusTarget);
    return () => cancelAnimationFrame(raf);
  }, [pendingFocus]);

  return { activeTab, setActiveTab, handleValidationFail };
}
