import { useContext, useEffect } from 'react';
import { AppShellMobileNavContext } from './AppShellMobileNavContext';

export function useAppShellMobileNav() {
  return useContext(AppShellMobileNavContext);
}

export function useRegisterAppShellMobileNav(open: () => void, isOpen: boolean) {
  const { registerMobileNav } = useAppShellMobileNav();

  useEffect(() => registerMobileNav({ open, isOpen }), [isOpen, open, registerMobileNav]);
}
