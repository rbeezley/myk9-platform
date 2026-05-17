import React, { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { isWizardSurface, isPathInWizardAllowlist } from '@/config/surface';
import { useAuthContext } from '@/hooks/useAuthContext';

// INTENT: when VITE_PUBLIC_SURFACE=wizard, the only experience for
// non-admin users is the show-creation wizard surface. Anything else 404s
// so the deployment feels like a focused single-purpose tool, not a
// stripped-down preview of the full app.

const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'));

export function WizardSurfaceGate() {
  const location = useLocation();
  const { isAdmin } = useAuthContext();

  if (!isWizardSurface || isAdmin || isPathInWizardAllowlist(location.pathname)) {
    return <Outlet />;
  }

  return (
    <Suspense fallback={null}>
      <NotFoundPage />
    </Suspense>
  );
}
