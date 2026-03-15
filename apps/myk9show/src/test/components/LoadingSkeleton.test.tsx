import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';

describe('LoadingSkeleton', () => {
  it('renders cards skeleton by default', () => {
    const { container } = render(<LoadingSkeleton variant="cards" count={3} />);
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('renders table skeleton when variant is table', () => {
    const { container } = render(<LoadingSkeleton variant="table" count={5} />);
    const rows = container.querySelectorAll('[class*="animate-pulse"]');
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });
});
