import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from 'react-error-boundary';

// Mock console.error to avoid noise in tests
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
});

// Test component that throws an error
const ThrowError = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Simple error fallback component
const ErrorFallback = ({ error, resetError }: { error: Error; resetError: () => void }) => (
  <div role="alert">
    <h2>Something went wrong:</h2>
    <pre>{error.message}</pre>
    <button onClick={resetError}>Try again</button>
  </div>
);

describe('Error Boundary', () => {
  describe('Error Handling', () => {
    it('should render children when there is no error', () => {
      render(
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('No error')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should render error fallback when child throws error', () => {
      render(
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong:')).toBeInTheDocument();
      expect(screen.getByText('Test error')).toBeInTheDocument();
      expect(screen.queryByText('No error')).not.toBeInTheDocument();
    });

    it('should display error message in fallback', () => {
      render(
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    it('should provide reset functionality', () => {
      const TestComponent = () => {
        const [shouldThrow, setShouldThrow] = React.useState(true);
        
        return (
          <ErrorBoundary 
            FallbackComponent={ErrorFallback}
            onReset={() => setShouldThrow(false)}
          >
            <ThrowError shouldThrow={shouldThrow} />
          </ErrorBoundary>
        );
      };

      render(<TestComponent />);

      // Initially shows error
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Click try again
      const tryAgainButton = screen.getByText('Try again');
      tryAgainButton.click();

      // Should show normal content
      expect(screen.getByText('No error')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Error Reporting', () => {
    it('should call onError callback when error occurs', () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary FallbackComponent={ErrorFallback} onError={onError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String)
        })
      );
    });

    it('should log error details for debugging', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Nested Error Boundaries', () => {
    it('should handle errors in nested components', () => {
      const NestedComponent = () => (
        <div>
          <h1>Parent Component</h1>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </div>
      );

      render(
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <NestedComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Parent Component')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });
  });

  describe('Custom Error Fallbacks', () => {
    it('should render custom error fallback with specific error types', () => {
      const NetworkErrorFallback = ({ error }: { error: Error }) => (
        <div data-testid="network-error">
          <h2>Network Error</h2>
          <p>Please check your connection</p>
          <details>
            <summary>Error details</summary>
            <pre>{error.message}</pre>
          </details>
        </div>
      );

      const NetworkError = () => {
        throw new Error('Network request failed');
      };

      render(
        <ErrorBoundary FallbackComponent={NetworkErrorFallback}>
          <NetworkError />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('network-error')).toBeInTheDocument();
      expect(screen.getByText('Network Error')).toBeInTheDocument();
      expect(screen.getByText('Please check your connection')).toBeInTheDocument();
    });

    it('should render different fallbacks based on error type', () => {
      const ConditionalErrorFallback = ({ error }: { error: Error }) => {
        if (error.message.includes('Network')) {
          return <div data-testid="network-fallback">Network issue</div>;
        }
        if (error.message.includes('Validation')) {
          return <div data-testid="validation-fallback">Validation error</div>;
        }
        return <div data-testid="generic-fallback">Something went wrong</div>;
      };

      const { rerender } = render(
        <ErrorBoundary FallbackComponent={ConditionalErrorFallback}>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      // Test network error
      const NetworkError = () => {
        throw new Error('Network request failed');
      };

      rerender(
        <ErrorBoundary FallbackComponent={ConditionalErrorFallback}>
          <NetworkError />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('network-fallback')).toBeInTheDocument();
    });
  });

  describe('Error Recovery', () => {
    it('should reset error state when resetKeys change', () => {
      const TestWithResetKeys = ({ resetKey }: { resetKey: string }) => {
        const [shouldThrow, setShouldThrow] = React.useState(true);
        
        React.useEffect(() => {
          setShouldThrow(false);
        }, [resetKey]);

        return (
          <ErrorBoundary 
            FallbackComponent={ErrorFallback}
            resetKeys={[resetKey]}
          >
            <ThrowError shouldThrow={shouldThrow} />
          </ErrorBoundary>
        );
      };

      const { rerender } = render(<TestWithResetKeys resetKey="1" />);

      // Initially shows error
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Change reset key
      rerender(<TestWithResetKeys resetKey="2" />);

      // Should recover and show normal content
      expect(screen.getByText('No error')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Async Error Handling', () => {
    it('should handle errors in async operations', async () => {
      const AsyncErrorComponent = () => {
        const [error, setError] = React.useState<Error | null>(null);

        React.useEffect(() => {
          // Simulate async error
          setTimeout(() => {
            setError(new Error('Async operation failed'));
          }, 100);
        }, []);

        if (error) {
          throw error;
        }

        return <div>Loading...</div>;
      };

      render(
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <AsyncErrorComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Async operation failed')).toBeInTheDocument();
      });
    });
  });
});