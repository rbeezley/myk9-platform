import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { logger } from '@/services/LoggingService';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new TypeError('kaboom');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the caught error itself, so its stack survives', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary level="section">
        <Boom />
      </ErrorBoundary>
    );
    const logged = errorSpy.mock.calls.find(call => call[0] === 'Error Boundary Caught Error:');
    const loggedError = logged?.[3];
    expect(loggedError).toBeInstanceOf(TypeError);
    expect((loggedError as Error).message).toBe('kaboom');
    expect((loggedError as Error).stack).toContain('Boom');
  });

  it('resets the retry count when the custom fallback retries', () => {
    const customFallback = ({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => (
      <button onClick={resetErrorBoundary}>custom retry</button>
    );
    const { rerender } = render(
      <ErrorBoundary level="page">
        <Boom />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: /Try Again \(3 attempts left\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Try Again \(2 attempts left\)/ }));
    expect(screen.getByRole('button', { name: /Try Again \(1 attempts left\)/ })).toBeTruthy();

    rerender(
      <ErrorBoundary level="page" fallback={customFallback}>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'custom retry' }));

    rerender(
      <ErrorBoundary level="page">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /Try Again \(3 attempts left\)/ })).toBeTruthy();
  });
});
