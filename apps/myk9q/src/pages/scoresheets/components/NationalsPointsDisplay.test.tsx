/**
 * Tests for NationalsPointsDisplay Component
 *
 * Component uses Tailwind utility classes (via cn() helper).
 * Tests use text-based queries and DOM structure rather than CSS class selectors.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NationalsPointsDisplay } from './NationalsPointsDisplay';

describe('NationalsPointsDisplay', () => {
  const defaultProps = {
    alertsCorrect: 0,
    alertsIncorrect: 0,
    faultCount: 0,
    finishCallErrors: 0,
    totalPoints: 0
  };

  describe('Rendering', () => {
    it('should render the component title', () => {
      render(<NationalsPointsDisplay {...defaultProps} />);
      expect(screen.getByText('Nationals Scoring')).toBeInTheDocument();
    });

    it('should render all score labels', () => {
      render(<NationalsPointsDisplay {...defaultProps} />);

      expect(screen.getByText('Correct Calls')).toBeInTheDocument();
      expect(screen.getByText('Incorrect Calls')).toBeInTheDocument();
      expect(screen.getByText('Faults')).toBeInTheDocument();
      expect(screen.getByText('No Finish Calls')).toBeInTheDocument();
      expect(screen.getByText('Total Points:')).toBeInTheDocument();
    });

    it('should render zero values by default', () => {
      render(<NationalsPointsDisplay {...defaultProps} />);

      // All four score values + total value should show 0
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Score values display', () => {
    it('should display correct calls count', () => {
      render(<NationalsPointsDisplay {...defaultProps} alertsCorrect={3} />);

      const label = screen.getByText('Correct Calls');
      expect(label.parentElement).toHaveTextContent('3');
    });

    it('should display incorrect calls count', () => {
      render(<NationalsPointsDisplay {...defaultProps} alertsIncorrect={2} />);

      const label = screen.getByText('Incorrect Calls');
      expect(label.parentElement).toHaveTextContent('2');
    });

    it('should display faults count', () => {
      render(<NationalsPointsDisplay {...defaultProps} faultCount={1} />);

      const label = screen.getByText('Faults');
      expect(label.parentElement).toHaveTextContent('1');
    });

    it('should display finish call errors count', () => {
      render(<NationalsPointsDisplay {...defaultProps} finishCallErrors={1} />);

      const label = screen.getByText('No Finish Calls');
      expect(label.parentElement).toHaveTextContent('1');
    });

    it('should display total points', () => {
      render(<NationalsPointsDisplay {...defaultProps} totalPoints={25} />);

      expect(screen.getByText('25')).toBeInTheDocument();
    });
  });

  describe('CSS classes', () => {
    it('should apply positive color class to correct calls value', () => {
      render(<NationalsPointsDisplay {...defaultProps} alertsCorrect={3} />);

      const label = screen.getByText('Correct Calls');
      const valueEl = label.parentElement!.querySelector('span:last-child');
      expect(valueEl).toHaveClass('text-teal-500');
    });

    it('should apply negative color class to incorrect calls value', () => {
      render(<NationalsPointsDisplay {...defaultProps} alertsIncorrect={2} />);

      const label = screen.getByText('Incorrect Calls');
      const valueEl = label.parentElement!.querySelector('span:last-child');
      expect(valueEl).toHaveClass('text-red-500');
    });

    it('should apply negative color class to faults value', () => {
      render(<NationalsPointsDisplay {...defaultProps} faultCount={1} />);

      const label = screen.getByText('Faults');
      const valueEl = label.parentElement!.querySelector('span:last-child');
      expect(valueEl).toHaveClass('text-red-500');
    });

    it('should apply negative color class to finish call errors value', () => {
      render(<NationalsPointsDisplay {...defaultProps} finishCallErrors={1} />);

      const label = screen.getByText('No Finish Calls');
      const valueEl = label.parentElement!.querySelector('span:last-child');
      expect(valueEl).toHaveClass('text-red-500');
    });

    it('should have a container with rounded styling', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      const breakdown = container.firstElementChild;
      expect(breakdown).toHaveClass('rounded-lg');
    });

    it('should have a grid layout for scores', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      const grid = container.querySelector('.grid');
      expect(grid).toBeInTheDocument();
    });

    it('should have total points section with rounded styling', () => {
      render(<NationalsPointsDisplay {...defaultProps} />);

      const totalRow = screen.getByText('Total Points:').parentElement;
      expect(totalRow).toHaveClass('rounded-md');
    });
  });

  describe('Real-world scoring scenarios', () => {
    it('should display perfect score (all correct, no penalties)', () => {
      render(
        <NationalsPointsDisplay
          alertsCorrect={4}
          alertsIncorrect={0}
          faultCount={0}
          finishCallErrors={0}
          totalPoints={40}
        />
      );

      expect(screen.getByText('Correct Calls').parentElement).toHaveTextContent('4');
      expect(screen.getByText('40')).toBeInTheDocument();
    });

    it('should display mixed score with penalties', () => {
      render(
        <NationalsPointsDisplay
          alertsCorrect={3}
          alertsIncorrect={1}
          faultCount={2}
          finishCallErrors={0}
          totalPoints={15}
        />
      );

      expect(screen.getByText('Correct Calls').parentElement).toHaveTextContent('3');
      expect(screen.getByText('Incorrect Calls').parentElement).toHaveTextContent('1');
      expect(screen.getByText('Faults').parentElement).toHaveTextContent('2');
      expect(screen.getByText('15')).toBeInTheDocument();
    });

    it('should display negative total points', () => {
      render(
        <NationalsPointsDisplay
          alertsCorrect={0}
          alertsIncorrect={3}
          faultCount={2}
          finishCallErrors={1}
          totalPoints={-30}
        />
      );

      expect(screen.getByText('-30')).toBeInTheDocument();
    });

    it('should display high scoring run', () => {
      render(
        <NationalsPointsDisplay
          alertsCorrect={10}
          alertsIncorrect={0}
          faultCount={0}
          finishCallErrors={0}
          totalPoints={100}
        />
      );

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should display zero score', () => {
      render(
        <NationalsPointsDisplay
          alertsCorrect={0}
          alertsIncorrect={0}
          faultCount={0}
          finishCallErrors={0}
          totalPoints={0}
        />
      );

      const totalLabel = screen.getByText('Total Points:');
      expect(totalLabel.parentElement).toHaveTextContent('0');
    });

    it('should handle all penalties present', () => {
      render(
        <NationalsPointsDisplay
          alertsCorrect={2}
          alertsIncorrect={1}
          faultCount={1}
          finishCallErrors={1}
          totalPoints={5}
        />
      );

      expect(screen.getByText('Correct Calls').parentElement).toHaveTextContent('2');
      expect(screen.getByText('Incorrect Calls').parentElement).toHaveTextContent('1');
      expect(screen.getByText('Faults').parentElement).toHaveTextContent('1');
      expect(screen.getByText('No Finish Calls').parentElement).toHaveTextContent('1');
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('Structure validation', () => {
    it('should have 4 score items in grid', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      const grid = container.querySelector('.grid');
      expect(grid?.children.length).toBe(4);
    });

    it('should render score items in correct order', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      const grid = container.querySelector('.grid');
      const labels = Array.from(grid!.querySelectorAll('span:first-child')).map(el => el.textContent);
      expect(labels).toEqual(['Correct Calls', 'Incorrect Calls', 'Faults', 'No Finish Calls']);
    });

    it('should have total points as separate element outside grid', () => {
      render(<NationalsPointsDisplay {...defaultProps} />);

      const totalLabel = screen.getByText('Total Points:');
      const totalRow = totalLabel.parentElement!;
      expect(totalRow.classList.contains('grid')).toBe(false);
      expect(totalRow.parentElement?.classList.contains('grid')).toBeFalsy();
    });
  });
});
