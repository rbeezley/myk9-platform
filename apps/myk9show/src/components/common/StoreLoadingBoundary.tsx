/* eslint-disable react-refresh/only-export-components */
import React, { ReactNode, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useStoreProvider } from '@/providers/StoreProvider';
import { StoreName } from '@/store/store-categories';
import { logger } from '@/services/LoggingService';

interface StoreLoadingBoundaryProps {
  children: ReactNode;
  requiredStores: StoreName[];
  fallback?: ReactNode;
  errorFallback?: (error: string, retry: () => void) => ReactNode;
}

/**
 * Component that ensures required stores are loaded before rendering children
 */
export const StoreLoadingBoundary: React.FC<StoreLoadingBoundaryProps> = ({
  children,
  requiredStores,
  fallback,
  errorFallback,
}) => {
  const { loadStore, isStoreLoaded, isStoreLoading, getStoreError } = useStoreProvider();
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const loadRequiredStores = async () => {
      try {
        await Promise.all(requiredStores.map(storeName => loadStore(storeName)));
        setHasInitialized(true);
      } catch (error) {
        logger.error('Failed to load required stores:', 'components', {}, error as Error);
        setHasInitialized(true); // Still set to true to show error state
      }
    };

    if (!hasInitialized) {
      loadRequiredStores();
    }
  }, [requiredStores, hasInitialized, loadStore]);

  if (!hasInitialized) {
    return fallback || <StoreLoadingSkeleton />;
  }

  // Check for any loading states
  const isAnyStoreLoading = requiredStores.some(storeName => isStoreLoading(storeName));
  if (isAnyStoreLoading) {
    return fallback || <StoreLoadingSkeleton />;
  }

  // Check for any errors
  const storeErrors = requiredStores
    .map(storeName => ({ storeName, error: getStoreError(storeName) }))
    .filter(({ error }) => error !== null);

  if (storeErrors.length > 0) {
    const retryLoadingStores = async () => {
      setHasInitialized(false);
      await Promise.all(requiredStores.map(storeName => loadStore(storeName)));
      setHasInitialized(true);
    };

    if (errorFallback) {
      return errorFallback(
        `Failed to load stores: ${storeErrors.map(({ storeName }) => storeName).join(', ')}`,
        retryLoadingStores
      );
    }
    
    return <StoreErrorFallback errors={storeErrors} onRetry={retryLoadingStores} />;
  }

  // Check that all stores are loaded
  const allStoresLoaded = requiredStores.every(storeName => isStoreLoaded(storeName));
  if (!allStoresLoaded) {
    return fallback || <StoreLoadingSkeleton />;
  }

  return <>{children}</>;
};

/**
 * Default loading skeleton
 */
const StoreLoadingSkeleton: React.FC = () => {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-5 w-5 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">Loading stores...</div>
      </div>
    </div>
  );
};

/**
 * Default error fallback
 */
interface StoreErrorFallbackProps {
  errors: Array<{ storeName: StoreName; error: string }>;
  onRetry: () => void;
}

const StoreErrorFallback: React.FC<StoreErrorFallbackProps> = ({ errors, onRetry }) => {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="p-3 bg-destructive/10 rounded-full mb-4 inline-block">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Store Loading Error</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Failed to load the following stores:
        </p>
        <ul className="text-sm text-muted-foreground mb-4 space-y-1">
          {errors.map(({ storeName, error }) => (
            <li key={storeName} className="font-mono">
              <span className="font-semibold">{storeName}:</span> {error}
            </li>
          ))}
        </ul>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Retry Loading
        </button>
      </div>
    </div>
  );
};

/**
 * HOC for wrapping components with store loading boundary
 */
export function withStoreLoading<P extends object>(
  Component: React.ComponentType<P>,
  requiredStores: StoreName[]
) {
  return function WithStoreLoadingComponent(props: P) {
    return (
      <StoreLoadingBoundary requiredStores={requiredStores}>
        <Component {...props} />
      </StoreLoadingBoundary>
    );
  };
}

/**
 * Hook for checking if stores are ready
 */
export const useStoresReady = (requiredStores: StoreName[]) => {
  const { isStoreLoaded, isStoreLoading, getStoreError } = useStoreProvider();

  const allLoaded = requiredStores.every(storeName => isStoreLoaded(storeName));
  const anyLoading = requiredStores.some(storeName => isStoreLoading(storeName));
  const errors = requiredStores
    .map(storeName => ({ storeName, error: getStoreError(storeName) }))
    .filter(({ error }) => error !== null);

  return {
    isReady: allLoaded && !anyLoading && errors.length === 0,
    isLoading: anyLoading,
    errors,
  };
};