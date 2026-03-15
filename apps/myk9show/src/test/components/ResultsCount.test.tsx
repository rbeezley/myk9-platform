import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ResultsCount } from '@/components/common/ResultsCount';

describe('ResultsCount', () => {
  it('shows total when showing equals total', () => {
    render(<ResultsCount showing={12} total={12} entityName="shows" />);
    expect(screen.getByText('12 shows')).toBeInTheDocument();
  });

  it('shows "X of Y" when filtered', () => {
    render(<ResultsCount showing={6} total={48} entityName="classes" filtered />);
    expect(screen.getByText('6 of 48 classes (filtered)')).toBeInTheDocument();
  });
});
