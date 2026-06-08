import React, { useCallback, useMemo, useState } from 'react';
import { AppShellMobileNavContext } from './AppShellMobileNavContext';

export function AppShellMobileNavProvider({ children }: { children: React.ReactNode }) {
  const [openMobileNav, setOpenMobileNav] = useState<(() => void) | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const registerMobileNav = useCallback((controls: { open: () => void; isOpen: boolean }) => {
    const openWithHeaderState = () => {
      setIsMobileNavOpen(true);
      controls.open();
    };

    setOpenMobileNav(() => openWithHeaderState);
    setIsMobileNavOpen(controls.isOpen);
    return () => {
      setOpenMobileNav(current => (current === openWithHeaderState ? null : current));
      setIsMobileNavOpen(false);
    };
  }, []);

  const value = useMemo(
    () => ({ isMobileNavOpen, openMobileNav, registerMobileNav }),
    [isMobileNavOpen, openMobileNav, registerMobileNav]
  );

  return (
    <AppShellMobileNavContext.Provider value={value}>{children}</AppShellMobileNavContext.Provider>
  );
}
