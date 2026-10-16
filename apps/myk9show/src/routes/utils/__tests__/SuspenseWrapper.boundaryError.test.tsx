import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
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
    const fallback = screen.getByText('Failed to load component').closest('[data-boundary-error]');
    expect(fallback).toHaveAttribute(
      'data-boundary-error',
      'ResultsTab: TypeError: Failed to fetch dynamically imported module: /assets/reads.js'
    );
  });
});
