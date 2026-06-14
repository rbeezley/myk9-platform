import type { ReactNode } from 'react';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ErrorBoundary } from './ErrorBoundary';

export type RoleSurface = 'ringside' | 'secretary' | 'judge' | 'exhibitor' | 'admin';

interface RoleSurfaceErrorBoundaryProps {
  surface: RoleSurface;
  children?: ReactNode;
}

const SURFACE_COPY: Record<
  RoleSurface,
  { title: string; reassurance: string; detail: string; homePath: string }
> = {
  ringside: {
    title: 'This ring view needs a refresh',
    reassurance: 'Your ring work is still saved on this device.',
    detail:
      'Try again when you are ready. If the page still will not load, go back to the class list.',
    homePath: '/at-show',
  },
  secretary: {
    title: 'This show workspace needs a refresh',
    reassurance: 'Your show work is still saved.',
    detail: 'Try again, or return to the dashboard and reopen the show workspace.',
    homePath: '/secretary/dashboard',
  },
  judge: {
    title: 'This judge view needs a refresh',
    reassurance: 'Any saved scoring work stays on this device.',
    detail: 'Try again before moving on. The app will keep local work calm while it recovers.',
    homePath: '/judge/dashboard',
  },
  exhibitor: {
    title: 'This page needs a refresh',
    reassurance: 'Your entries and dog information are still here.',
    detail: 'Try again, or return to your shows and continue from there.',
    homePath: '/exhibitor/entries',
  },
  admin: {
    title: 'This admin view needs a refresh',
    reassurance: 'The platform data is still intact.',
    detail: 'Try again, or return to the admin dashboard to keep investigating.',
    homePath: '/admin/dashboard',
  },
};

export function RoleSurfaceErrorBoundary({ surface, children }: RoleSurfaceErrorBoundaryProps) {
  const copy = SURFACE_COPY[surface];
  const navigate = useNavigate();

  return (
    <ErrorBoundary
      level="section"
      context={`${surface} surface`}
      fallback={({ resetErrorBoundary }) => (
        <div className="min-h-[50vh] flex items-center justify-center px-4 py-8">
          <section
            aria-live="polite"
            className="w-full max-w-lg rounded-lg border bg-card p-5 text-card-foreground shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-destructive/10 p-2 text-destructive">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-2">
                <h2 className="text-lg font-semibold">{copy.title}</h2>
                <p className="text-sm font-medium">{copy.reassurance}</p>
                <p className="text-sm text-muted-foreground">{copy.detail}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" onClick={resetErrorBoundary}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigate(copy.homePath);
                }}
              >
                <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                Go back
              </Button>
            </div>
          </section>
        </div>
      )}
    >
      {children ?? <Outlet />}
    </ErrorBoundary>
  );
}
