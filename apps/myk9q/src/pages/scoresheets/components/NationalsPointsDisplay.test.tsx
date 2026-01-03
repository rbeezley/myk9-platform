/**
 * Tests for NationalsPointsDisplay Component
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
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      const values = container.querySelectorAll('.item-value');
      values.forEach(value => {
        expect(value.textContent).toBe('0');
      });
    });
  });

  describe('Score values display', () => {
    it('should display correct calls count', () => {
      render(<NationalsPointsDisplay {...defaultProps} alertsCorrect={3} />);

      const correctCallsItem = screen.getByText('Correct Calls').closest('.score-item');
      expect(correctCallsItem?.querySelector('.item-value')).toHaveTextContent('3');
    });

    it('should display incorrect calls count', () => {
      render(<NationalsPointsDisplay {...defaultProps} alertsIncorrect={2} />);

      const incorrectCallsItem = screen.getByText('Incorrect Calls').closest('.score-item');
      expect(incorrectCallsItem?.querySelector('.item-value')).toHaveTextContent('2');
    });

    it('should display faults count', () => {
      render(<NationalsPointsDisplay {...defaultProps} faultCount={1} />);

      const faultsItem = screen.getByText('Faults').closest('.score-item');
      expect(faultsItem?.querySelector('.item-value')).toHaveTextContent('1');
    });

    it('should display finish call errors count', () => {
      render(<NationalsPointsDisplay {...defaultProps} finishCallErrors={1} />);

      const finishCallItem = screen.getByText('No Finish Calls').closest('.score-item');
      expect(finishCallItem?.querySelector('.item-value')).toHaveTextContent('1');
    });

    it('should display total points', () => {
      render(<NationalsPointsDisplay {...defaultProps} totalPoints={25} />);

      expect(screen.getByText('25')).toBeInTheDocument();
    });
  });

  describe('CSS classes', () => {
    it('should apply positive class to correct calls', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} alertsCorrect={3} />);

      const correctCallsItem = screen.getByText('Correct Calls').closest('.score-item');
      const value = correctCallsItem?.querySelector('.item-value');
      expect(value).toHaveClass('positive');
    });

    it('should apply negative class to incorrect calls', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} alertsIncorrect={2} />);

      const incorrectCallsItem = screen.getByText('Incorrect Calls').closest('.score-item');
      const value = incorrectCallsItem?.querySelector('.item-value');
      expect(value).toHaveClass('negative');
    });

    it('should apply negative class to faults', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} faultCount={1} />);

      const faultsItem = screen.getByText('Faults').closest('.score-item');
      const value = faultsItem?.querySelector('.item-value');
      expect(value).toHaveClass('negative');
    });

    it('should apply negative class to finish call errors', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} finishCallErrors={1} />);

      const finishCallItem = screen.getByText('No Finish Calls').closest('.score-item');
      const value = finishCallItem?.querySelector('.item-value');
      expect(value).toHaveClass('negative');
    });

    it('should have nationals-breakdown container class', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      expect(container.querySelector('.nationals-breakdown')).toBeInTheDocument();
    });

    it('should have score-grid class', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      expect(container.querySelector('.score-grid')).toBeInTheDocument();
    });

    it('should have total-points container', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      expect(container.querySelector('.total-points')).toBeInTheDocument();
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

      expect(screen.getByText('Correct Calls').closest('.score-item')?.querySelector('.item-value')).toHaveTextContent('4');
      expect(screen.getByText('Total Points:').closest('.total-points')?.querySelector('.total-value')).toHaveTextContent('40');
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

      expect(screen.getByText('Correct Calls').closest('.score-item')?.querySelector('.item-value')).toHaveTextContent('3');
      expect(screen.getByText('Incorrect Calls').closest('.score-item')?.querySelector('.item-value')).toHaveTextContent('1');
      expect(screen.getByText('Faults').closest('.score-item')?.querySelector('.item-value')).toHaveTextContent('2');
      expect(screen.getByText('Total Points:').closest('.total-points')?.querySelector('.total-value')).toHaveTextContent('15');
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

      expect(screen.getByText('Total Points:').closest('.total-points')?.querySelector('.total-value')).toHaveTextContent('0');
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

      expect(screen.getByText('Correct Calls').closest('.score-item')?.querySelector('.item-value')).toHaveTextContent('2');
      expect(screen.getByText('Incorrect Calls').closest('.score-item')?.querySelector('.item-value')).toHaveTextContent('1');
      expect(screen.getByText('Faults').closest('.score-item')?.querySelector('.item-value')).toHaveTextContent('1');
      expect(screen.getByText('No Finish Calls').closest('.score-item')?.querySelector('.item-value')).toHaveTextContent('1');
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('Structure validation', () => {
    it('should have 4 score items in grid', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      const scoreItems = container.querySelectorAll('.score-grid .score-item');
      expect(scoreItems.length).toBe(4);
    });

    it('should render score items in correct order', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      const labels = Array.from(container.querySelectorAll('.score-grid .item-label')).map(el => el.textContent);
      expect(labels).toEqual(['Correct Calls', 'Incorrect Calls', 'Faults', 'No Finish Calls']);
    });

    it('should have total points as separate element outside grid', () => {
      const { container } = render(<NationalsPointsDisplay {...defaultProps} />);

      const totalPoints = container.querySelector('.total-points');
      expect(totalPoints).toBeInTheDocument();
      expect(totalPoints?.parentElement?.classList.contains('score-grid')).toBe(false);
    });
  });
});
