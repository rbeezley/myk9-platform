import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ResultsCount } from '@/components/common/ResultsCount';

describe('ResultsCount', () => {
  it('shows total when showing equals total', () => {
    render(<ResultsCount showing={12} total={12} entityName="shows" />);
    expect(screen.getByText('12 shows')).toBeInTheDocument();
  });

  it('shows "Showing X of Y" when narrowed', () => {
    render(<ResultsCount showing={6} total={48} entityName="classes" filtered />);
    expect(screen.getByText('Showing 6 of 48 classes')).toBeInTheDocument();
  });

  it('keeps the "(filtered)" hint when a filter is active but nothing was excluded', () => {
    // Without it, an active filter that happens to match everything would be
    // indistinguishable from no filter at all.
    render(<ResultsCount showing={48} total={48} entityName="classes" filtered />);
    expect(screen.getByText('48 classes (filtered)')).toBeInTheDocument();
  });
});
