import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';

// The guest landing page at `/` draws its own header, so the app header is absent there.
// AppHeader (hide) and SidebarLayout (no header padding) must agree, or the shell pads for
// a header that is never drawn: the blank band in docs/qa/landing-page-ux-audit.md.
export function useIsGuestLanding(): boolean {
  const { user } = useAuthContext();
  const { pathname } = useLocation();
  return !user && pathname === '/';
}
