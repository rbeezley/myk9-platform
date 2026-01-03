// src/components/podium/PodiumPosition.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PodiumPosition } from './PodiumPosition';

describe('PodiumPosition', () => {
  const defaultProps = {
    placement: 1 as const,
    handlerName: 'Sarah Mitchell',
    dogName: 'Biscuit',
    breed: 'Golden Retriever',
  };

  it('renders handler name', () => {
    render(<PodiumPosition {...defaultProps} />);
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
  });

  it('renders dog name with quotes', () => {
    render(<PodiumPosition {...defaultProps} />);
    expect(screen.getByText(/"Biscuit"/)).toBeInTheDocument();
  });

  it('renders breed', () => {
    render(<PodiumPosition {...defaultProps} />);
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });

  it('renders placement badge with correct label', () => {
    render(<PodiumPosition {...defaultProps} placement={1} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
  });

  it('renders 2nd place correctly', () => {
    render(<PodiumPosition {...defaultProps} placement={2} />);
    expect(screen.getByText('2nd')).toBeInTheDocument();
  });

  it('renders 3rd place correctly', () => {
    render(<PodiumPosition {...defaultProps} placement={3} />);
    expect(screen.getByText('3rd')).toBeInTheDocument();
  });

  it('renders 4th place correctly', () => {
    render(<PodiumPosition {...defaultProps} placement={4} />);
    expect(screen.getByText('4th')).toBeInTheDocument();
  });

  it('applies correct placement class', () => {
    const { container } = render(<PodiumPosition {...defaultProps} placement={1} />);
    expect(container.querySelector('.podium-position--first')).toBeInTheDocument();
  });

  it('renders armband when provided', () => {
    render(<PodiumPosition {...defaultProps} armband={42} />);
    expect(screen.getByText('#42')).toBeInTheDocument();
  });

  describe('animation', () => {
    it('does not apply animate class by default', () => {
      const { container } = render(<PodiumPosition {...defaultProps} />);
      expect(container.querySelector('.podium-position--animate')).not.toBeInTheDocument();
    });

    it('applies animate class when animate prop is true', () => {
      const { container } = render(<PodiumPosition {...defaultProps} animate={true} />);
      expect(container.querySelector('.podium-position--animate')).toBeInTheDocument();
    });

    it('does not apply animate class when animate prop is false', () => {
      const { container } = render(<PodiumPosition {...defaultProps} animate={false} />);
      expect(container.querySelector('.podium-position--animate')).not.toBeInTheDocument();
    });
  });
});
