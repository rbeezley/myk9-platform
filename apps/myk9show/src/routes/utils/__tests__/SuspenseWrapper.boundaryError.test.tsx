import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { logger } from '@/services/LoggingService';
import { SuspenseWrapper } from '../SuspenseWrapper';

function Boom(): never {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/reads.js');
}

describe('LoadingErrorBoundary (MYK9-1114)', () => {
  it('names the caught error on the fallback so a production failure leaves a trace', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SuspenseWrapper componentName="ResultsTab">
        <Boom />
      </SuspenseWrapper>
    );
    const fallback = screen
      .getByText("We couldn't open this page")
      .closest('[data-boundary-error]');
    expect(fallback).toHaveAttribute(
      'data-boundary-error',
      'ResultsTab: TypeError: Failed to fetch dynamically imported module: /assets/reads.js'
    );
  });

  it('logs the error name and message, not only the component stack (MYK9-2285)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    render(
      <SuspenseWrapper>
        <Boom />
      </SuspenseWrapper>
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'LoadingErrorBoundary caught an error: TypeError: Failed to fetch dynamically imported module: /assets/reads.js',
      'utils',
      expect.objectContaining({
        errorName: 'TypeError',
        errorMessage: 'Failed to fetch dynamically imported module: /assets/reads.js',
      }),
      expect.any(TypeError)
    );
  });

  it('keeps the retry count across retries so the counter renders', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SuspenseWrapper>
        <Boom />
      </SuspenseWrapper>
    );
    expect(screen.queryByText(/You have tried again/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(screen.getByText('You have tried again 1 time.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(screen.getByText('You have tried again 2 times.')).toBeTruthy();
  });
});
