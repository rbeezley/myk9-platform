/**
 * OfflineFallback Component
 *
 * Displayed when user navigates to a route that hasn't been cached
 * and they're offline.
 */

import { WifiOff, RefreshCw, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getVisitedRoutes } from '@/utils/offlineRouter';
import { cn } from '../../lib/utils';

interface OfflineFallbackProps {
  /**
   * The route path that couldn't be loaded
   */
  path?: string;

  /**
   * Optional message to display
   */
  message?: string;
}

export function OfflineFallback({ path, message }: OfflineFallbackProps) {
  const navigate = useNavigate();
  const visitedRoutes = getVisitedRoutes();

  const handleRetry = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-[var(--border-subtle)]">
      <div className={cn(
        "max-w-[500px] text-center bg-white rounded-2xl",
        "py-12 px-8 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)]"
      )}>
        <div className="mb-6 text-[var(--token-text-muted)]">
          <WifiOff size={64} className="mx-auto" />
        </div>

        <h1 className="text-3xl font-bold text-[var(--foreground)] m-0 mb-4">You're Offline</h1>

        <p className="text-[var(--muted-foreground)] text-base m-0 mb-8 leading-relaxed">
          {message || (
            <>
              {path && (
                <>
                  The page <strong className="text-[var(--token-text-secondary)] font-semibold">{path}</strong> hasn't been cached yet.
                </>
              )}
              {!path && 'This page is not available offline.'}
            </>
          )}
        </p>

        <div className="flex gap-4 justify-center mb-8">
          <button
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-lg",
              "text-sm font-medium cursor-pointer transition-all duration-200 border-none",
              "bg-[var(--primary)] text-white hover:bg-indigo-600"
            )}
            onClick={handleRetry}
          >
            <RefreshCw size={20} />
            Retry
          </button>
          <button
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-lg",
              "text-sm font-medium cursor-pointer transition-all duration-200",
              "bg-[var(--input)] text-[var(--token-text-secondary)]",
              "border border-[var(--border)] hover:bg-[var(--border)]"
            )}
            onClick={handleGoHome}
          >
            <Home size={20} />
            Go Home
          </button>
        </div>

        {visitedRoutes.length > 0 && (
          <div className="mt-8 pt-8 border-t border-[var(--border)] text-left">
            <h3 className="text-base font-semibold text-[var(--foreground)] m-0 mb-2">Available Pages</h3>
            <p className="text-sm text-[var(--muted-foreground)] m-0 mb-4">These pages are cached and available offline:</p>
            <ul className="list-none p-0 m-0">
              {visitedRoutes.slice(0, 5).map((route) => (
                <li key={route} className="my-2">
                  <a
                    href={route}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(route);
                    }}
                    className={cn(
                      "block py-2.5 px-4 bg-[var(--muted)] rounded-md",
                      "text-[var(--primary)] no-underline text-sm",
                      "transition-all duration-200 hover:bg-[var(--secondary)] hover:text-indigo-600"
                    )}
                  >
                    {route}
                  </a>
                </li>
              ))}
              {visitedRoutes.length > 5 && (
                <li className="py-2.5 px-4 text-[var(--token-text-muted)] text-sm italic">
                  +{visitedRoutes.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}

        <div className={cn(
          "mt-8 p-4 bg-[var(--secondary)] border border-sky-200 rounded-lg",
          "text-sm text-[var(--primary)] text-left"
        )}>
          <strong className="font-semibold">Tip:</strong> When online, visit pages you'll need offline to cache them automatically.
        </div>
      </div>
    </div>
  );
}
