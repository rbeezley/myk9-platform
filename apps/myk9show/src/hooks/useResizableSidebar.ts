import { useState, useEffect, useCallback } from 'react';

interface UseResizableSidebarProps {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  defaultCollapsed?: boolean;
}

interface UseResizableSidebarReturn {
  width: number;
  isResizing: boolean;
  isCollapsed: boolean;
  startResizing: (e: React.MouseEvent) => void;
  stopResizing: () => void;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export function useResizableSidebar({
  initialWidth = 280,
  minWidth = 200,
  maxWidth = 400,
  storageKey = 'dogSidebarWidth',
  defaultCollapsed = false,
}: UseResizableSidebarProps = {}): UseResizableSidebarReturn {
  // Get saved width from localStorage if available
  const getSavedWidth = (): number => {
    if (typeof window === 'undefined') return initialWidth;
    const saved = localStorage.getItem(storageKey);
    return saved ? Math.max(minWidth, Math.min(maxWidth, parseInt(saved, 10))) : initialWidth;
  };

  // Get saved collapsed state from localStorage if available
  const getSavedCollapsedState = (): boolean => {
    if (typeof window === 'undefined') return defaultCollapsed;
    const saved = localStorage.getItem(`${storageKey}_collapsed`);
    return saved ? saved === 'true' : defaultCollapsed;
  };

  const [width, setWidth] = useState<number>(getSavedWidth);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(getSavedCollapsedState);
  const [prevWidth, setPrevWidth] = useState<number>(getSavedWidth); // Store width before collapse

  // Save width to localStorage when it changes
  useEffect(() => {
    if (!isCollapsed) {
      localStorage.setItem(storageKey, width.toString());
    }
  }, [width, storageKey, isCollapsed]);

  // Save collapsed state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(`${storageKey}_collapsed`, isCollapsed.toString());
  }, [isCollapsed, storageKey]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const toggleCollapsed = useCallback(() => {
    if (isCollapsed) {
      // Expanding - restore previous width
      setIsCollapsed(false);
      setWidth(prevWidth);
    } else {
      // Collapsing - save current width
      setPrevWidth(width);
      setIsCollapsed(true);
    }
  }, [isCollapsed, width, prevWidth]);

  // Add resize event listener
  useEffect(() => {
    const handleResize = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = Math.max(minWidth, Math.min(maxWidth, e.clientX));
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  return {
    width: isCollapsed ? 60 : width, // Collapsed width is fixed
    isResizing,
    isCollapsed,
    startResizing,
    stopResizing,
    toggleCollapsed,
    setCollapsed: (collapsed: boolean) => setIsCollapsed(collapsed),
  };
}
