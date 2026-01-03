// src/components/podium/PodiumCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PodiumCard } from './PodiumCard';

describe('PodiumCard', () => {
  const defaultProps = {
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    placements: [
      { placement: 1 as const, handlerName: 'Sarah', dogName: 'Biscuit', breed: 'Golden' },
      { placement: 2 as const, handlerName: 'Tom', dogName: 'Pepper', breed: 'Border Collie' },
      { placement: 3 as const, handlerName: 'Linda', dogName: 'Mochi', breed: 'Shiba' },
      { placement: 4 as const, handlerName: 'David', dogName: 'Bruno', breed: 'GSD' },
    ],
  };

  it('renders class name in header', () => {
    render(<PodiumCard {...defaultProps} />);
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
  });

  it('renders class icon', () => {
    render(<PodiumCard {...defaultProps} />);
    // All classes use elegant diamond symbol (✦) for premium aesthetic
    expect(screen.getByText('✦')).toBeInTheDocument();
  });

  it('renders all four placements', () => {
    render(<PodiumCard {...defaultProps} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('3rd')).toBeInTheDocument();
    expect(screen.getByText('4th')).toBeInTheDocument();
  });

  it('renders all handler names', () => {
    render(<PodiumCard {...defaultProps} />);
    expect(screen.getByText('Sarah')).toBeInTheDocument();
    expect(screen.getByText('Tom')).toBeInTheDocument();
    expect(screen.getByText('Linda')).toBeInTheDocument();
    expect(screen.getByText('David')).toBeInTheDocument();
  });

  it('handles missing placements gracefully', () => {
    const props = {
      ...defaultProps,
      placements: [
        { placement: 1 as const, handlerName: 'Sarah', dogName: 'Biscuit', breed: 'Golden' },
      ],
    };
    render(<PodiumCard {...props} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.queryByText('2nd')).not.toBeInTheDocument();
  });

  it('uses consistent icon across all elements', () => {
    // All elements use the same elegant ✦ symbol for premium aesthetic
    const elements = ['Interior', 'Exterior', 'Buried', 'Handler Discrimination'];
    elements.forEach(element => {
      const { container, unmount } = render(<PodiumCard {...defaultProps} element={element} />);
      expect(container.querySelector('.podium-card__icon')).toHaveTextContent('✦');
      unmount();
    });
  });

  describe('animation', () => {
    it('does not apply animate class by default', () => {
      const { container } = render(<PodiumCard {...defaultProps} />);
      expect(container.querySelector('.podium-card--animate')).not.toBeInTheDocument();
    });

    it('applies animate class when animate prop is true', () => {
      const { container } = render(<PodiumCard {...defaultProps} animate={true} />);
      expect(container.querySelector('.podium-card--animate')).toBeInTheDocument();
    });

    it('passes animate prop to child PodiumPosition components', () => {
      const { container } = render(<PodiumCard {...defaultProps} animate={true} />);
      const positions = container.querySelectorAll('.podium-position--animate');
      expect(positions.length).toBe(4);
    });

    it('does not animate children when animate is false', () => {
      const { container } = render(<PodiumCard {...defaultProps} animate={false} />);
      const positions = container.querySelectorAll('.podium-position--animate');
      expect(positions.length).toBe(0);
    });
  });
});
