import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AppErrorFallback } from '../AppErrorFallback';

describe('AppErrorFallback', () => {
  it('says what failed and what to do for an error with no friendlier mapping', () => {
    render(<AppErrorFallback error={new Error('boom')} resetErrorBoundary={vi.fn()} />);

    expect(screen.getByRole('heading', { name: "We couldn't show this page" })).toBeInTheDocument();
    expect(
      screen.getByText('Try again, or go to Home. If it keeps happening, restart the app.')
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
