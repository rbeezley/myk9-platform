import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LiveClassCard } from '@/components/live/LiveClassCard';

describe('LiveClassCard', () => {
  const baseProps = {
    classTitle: 'Novice JWW',
    judgeName: 'Jane Smith',
    status: 'in_progress' as const,
    totalEntries: 28,
    completedEntries: 12,
    inRingArmband: '142',
    nextArmbands: ['145', '146', '148'],
  };

  it('renders class name and judge', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('Novice JWW')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    const { container } = render(<LiveClassCard {...baseProps} />);
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('renders in-ring dog armband', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('#142')).toBeInTheDocument();
  });

  it('renders next 3 armbands', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('#145')).toBeInTheDocument();
    expect(screen.getByText('#146')).toBeInTheDocument();
    expect(screen.getByText('#148')).toBeInTheDocument();
  });

  it('renders remaining count', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('16 of 28 remaining')).toBeInTheDocument();
  });

  it('shows "X dogs ahead" for user entry', () => {
    render(<LiveClassCard {...baseProps} userDogsAhead={3} userDogName="Bella" />);
    expect(screen.getByText('3 dogs ahead')).toBeInTheDocument();
  });
});
