import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsGrid } from './StatsGrid';

describe('StatsGrid', () => {
  it('should render children', () => {
    render(
      <StatsGrid>
        <div>Card 1</div>
        <div>Card 2</div>
      </StatsGrid>
    );
    expect(screen.getByText('Card 1')).toBeInTheDocument();
    expect(screen.getByText('Card 2')).toBeInTheDocument();
  });

  it('should default to 4 columns', () => {
    const { container } = render(
      <StatsGrid>
        <div>Card</div>
      </StatsGrid>
    );
    expect(container.firstChild).toHaveClass('lg:grid-cols-4');
  });

  it('should apply correct class for 2 columns', () => {
    const { container } = render(
      <StatsGrid columns={2}>
        <div>Card</div>
      </StatsGrid>
    );
    expect(container.firstChild).toHaveClass('sm:grid-cols-2');
    expect(container.firstChild).not.toHaveClass('lg:grid-cols-4');
  });

  it('should apply correct class for 3 columns', () => {
    const { container } = render(
      <StatsGrid columns={3}>
        <div>Card</div>
      </StatsGrid>
    );
    expect(container.firstChild).toHaveClass('lg:grid-cols-3');
  });

  it('should apply correct class for 5 columns', () => {
    const { container } = render(
      <StatsGrid columns={5}>
        <div>Card</div>
      </StatsGrid>
    );
    expect(container.firstChild).toHaveClass('lg:grid-cols-5');
  });

  it('should append custom className', () => {
    const { container } = render(
      <StatsGrid className="mb-8">
        <div>Card</div>
      </StatsGrid>
    );
    expect(container.firstChild).toHaveClass('mb-8');
    expect(container.firstChild).toHaveClass('grid');
  });

  it('should always include base grid and gap classes', () => {
    const { container } = render(
      <StatsGrid columns={3}>
        <div>Card</div>
      </StatsGrid>
    );
    expect(container.firstChild).toHaveClass('grid', 'grid-cols-1', 'gap-4');
  });
});
