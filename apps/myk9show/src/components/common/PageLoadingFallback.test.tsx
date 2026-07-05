import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import { describe, expect, it } from 'vitest';
import { PageLoadingFallback } from './PageLoadingFallback';

describe('PageLoadingFallback', () => {
  it('renders a branded loading placeholder instead of generic page copy', () => {
    render(<PageLoadingFallback />);

    expect(screen.getByRole('status', { name: /preparing myk9show/i })).toBeInTheDocument();
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
    expect(screen.getByText('Preparing your workspace...')).toBeInTheDocument();
    expect(screen.queryByText(/loading page/i)).not.toBeInTheDocument();
  });
});
