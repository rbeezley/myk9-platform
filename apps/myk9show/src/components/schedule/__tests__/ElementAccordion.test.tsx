import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ElementAccordion } from '../ElementAccordion';
import { CLASS_STATUS } from '@myk9/core';
import type { ElementSummary } from '../schedule-timeline.types';

const mockElement: ElementSummary = {
  element: 'Sit',
  startTime: '09:00:00',
  levelRange: 'Nov-Adv',
  status: CLASS_STATUS.IN_PROGRESS,
  levels: [
    { classId: 'c1', level: 'Novice', status: CLASS_STATUS.IN_PROGRESS, entryCount: 5 },
    { classId: 'c2', level: 'Advanced', status: CLASS_STATUS.COMPLETED, entryCount: 3 },
  ],
  completedCount: 1,
  totalCount: 2,
};

const completedElement: ElementSummary = {
  element: 'Down',
  startTime: '10:00:00',
  levelRange: 'Nov-Adv',
  status: CLASS_STATUS.COMPLETED,
  levels: [
    { classId: 'c3', level: 'Novice', status: CLASS_STATUS.COMPLETED, entryCount: 4 },
    { classId: 'c4', level: 'Advanced', status: CLASS_STATUS.COMPLETED, entryCount: 2 },
  ],
  completedCount: 2,
  totalCount: 2,
};

describe('ElementAccordion', () => {
  it('renders element name and progress', () => {
    render(<ElementAccordion element={mockElement} />);
    expect(screen.getByText('Sit')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('auto-opens when status is IN_PROGRESS', () => {
    render(<ElementAccordion element={mockElement} />);
    expect(screen.getByText('Novice')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('starts closed when status is COMPLETED', () => {
    render(<ElementAccordion element={completedElement} />);
    expect(screen.queryByText('Novice')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
  });

  it('opens when trigger is clicked', async () => {
    render(<ElementAccordion element={completedElement} />);
    const trigger = screen.getByText('Down');

    expect(screen.queryByText('Novice')).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(screen.getByText('Novice')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('closes when trigger is clicked again', async () => {
    render(<ElementAccordion element={mockElement} />);
    const trigger = screen.getByText('Sit');

    expect(screen.getByText('Novice')).toBeInTheDocument();

    await userEvent.click(trigger);

    expect(screen.queryByText('Novice')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
  });

  it('toggles multiple times without getting stuck', async () => {
    render(<ElementAccordion element={mockElement} />);
    const trigger = screen.getByText('Sit');

    // Initially open (IN_PROGRESS)
    expect(screen.getByText('Novice')).toBeInTheDocument();

    // Close
    await userEvent.click(trigger);
    expect(screen.queryByText('Novice')).not.toBeInTheDocument();

    // Open again
    await userEvent.click(trigger);
    expect(screen.getByText('Novice')).toBeInTheDocument();

    // Close again
    await userEvent.click(trigger);
    expect(screen.queryByText('Novice')).not.toBeInTheDocument();

    // Open one more time
    await userEvent.click(trigger);
    expect(screen.getByText('Novice')).toBeInTheDocument();
  });

  it('calls onNavigateToClass when level is clicked', async () => {
    const onNavigate = vi.fn();
    render(<ElementAccordion element={mockElement} onNavigateToClass={onNavigate} />);

    const levelLink = screen.getByText('Novice');
    await userEvent.click(levelLink);

    expect(onNavigate).toHaveBeenCalledWith('c1');
  });

  it('shows correct progress for completed element', () => {
    render(<ElementAccordion element={completedElement} />);
    expect(screen.getByText('2/2 ✓')).toBeInTheDocument();
  });

  it('displays formatted time', () => {
    render(<ElementAccordion element={mockElement} />);
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
  });

  it('displays entry counts for levels', async () => {
    render(<ElementAccordion element={mockElement} />);
    expect(screen.getByText('5 entries')).toBeInTheDocument();
    expect(screen.getByText('3 entries')).toBeInTheDocument();
  });
});
