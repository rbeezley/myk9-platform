import { createContext } from 'react';

export interface AppShellMobileNavContextValue {
  isMobileNavOpen: boolean;
  openMobileNav: (() => void) | null;
  registerMobileNav: (controls: { open: () => void; isOpen: boolean }) => () => void;
}

export const AppShellMobileNavContext = createContext<AppShellMobileNavContextValue>({
  isMobileNavOpen: false,
  openMobileNav: null,
  registerMobileNav: () => () => undefined,
});
