import React from 'react';
import { AlertCircle } from 'lucide-react';
import { friendlyDbError } from '@/utils/friendlyDbError';

/** The whole-app error screen: what failed, and what to do. */
export const AppErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: Error | null;
  resetErrorBoundary: () => void;
}) => {
  const message = React.useMemo(
    () =>
      friendlyDbError(error, 'Try again, or go to Home. If it keeps happening, restart the app.'),
    [error]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="max-w-md w-full p-6 bg-card rounded-lg shadow-md">
        <div className="flex flex-col items-center text-center">
          <div className="p-3 bg-destructive/10 rounded-full mb-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold mb-2">We couldn&apos;t show this page</h2>
          <p className="text-muted-foreground mb-4">{message}</p>
          <div className="flex gap-4">
            <button
              onClick={resetErrorBoundary}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="px-4 py-2 border border-input rounded-md hover:bg-accent hover:text-accent-foreground transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
