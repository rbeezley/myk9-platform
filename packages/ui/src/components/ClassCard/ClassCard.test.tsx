import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassCard } from './ClassCard';

const defaultProps = {
  className: 'Novice A Buried',
  status: 'In Progress',
  entryCount: 12,
  completedCount: 5,
};

describe('ClassCard', () => {
  it('should render with class name', () => {
    render(<ClassCard {...defaultProps} />);
    expect(screen.getByText('Novice A Buried')).toBeInTheDocument();
  });

  it('should render status label', () => {
    render(<ClassCard {...defaultProps} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'In Progress' })).toHaveAttribute(
      'data-family',
      'class'
    );
  });

  it('keeps a cancelled class destructive instead of mapping it to neutral', () => {
    render(<ClassCard {...defaultProps} status="Cancelled" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cancelled' })).toHaveClass('text-destructive');
  });

  it('should render judge name when provided', () => {
    render(<ClassCard {...defaultProps} judgeName="Jane Smith" />);
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('should render remaining count', () => {
    render(
      <ClassCard
        {...defaultProps}
        entries={[
          { id: 1, armband: 101 },
          { id: 2, armband: 102 },
        ]}
      />
    );
    expect(screen.getByText('7 of 12 remaining')).toBeInTheDocument();
  });

  it('should show "All complete" when status is completed', () => {
    render(
      <ClassCard
        {...defaultProps}
        status="Completed"
        entryCount={5}
        completedCount={5}
        entries={[{ id: 1, armband: 101, isScored: true }]}
      />
    );
    expect(screen.getByText('All complete')).toBeInTheDocument();
  });

  it('should show "No entries yet" when entries array is empty', () => {
    render(<ClassCard {...defaultProps} entries={[]} />);
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
  });

  it('should display status time when provided', () => {
    render(<ClassCard {...defaultProps} statusTime="10:30 AM" />);
    expect(screen.getByText('10:30 AM')).toBeInTheDocument();
  });

  describe('entry preview', () => {
    it('should highlight in-ring entry', () => {
      render(
        <ClassCard
          {...defaultProps}
          entries={[
            { id: 1, armband: 102, inRing: true },
            { id: 2, armband: 105 },
          ]}
        />
      );
      expect(screen.getByText('#102')).toBeInTheDocument();
      expect(screen.getByText('#105')).toBeInTheDocument();
    });

    it('should show up to 3 next entries', () => {
      render(
        <ClassCard
          {...defaultProps}
          entries={[
            { id: 1, armband: 101 },
            { id: 2, armband: 102 },
            { id: 3, armband: 103 },
            { id: 4, armband: 104 },
            { id: 5, armband: 105 },
          ]}
        />
      );
      expect(screen.getByText('#101')).toBeInTheDocument();
      expect(screen.getByText('#102')).toBeInTheDocument();
      expect(screen.getByText('#103')).toBeInTheDocument();
      // 4th and 5th should not be shown (max 3 next entries)
      expect(screen.queryByText('#104')).not.toBeInTheDocument();
    });
  });

  describe('progress bar', () => {
    it('should render progress bar when entryCount > 0', () => {
      const { container } = render(<ClassCard {...defaultProps} />);
      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar).not.toBeNull();
    });

    it('should calculate correct progress percentage', () => {
      const { container } = render(
        <ClassCard {...defaultProps} entryCount={10} completedCount={5} />
      );
      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar?.getAttribute('style')).toContain('50%');
    });
  });

  describe('interactions', () => {
    it('should call onCardClick when card is clicked', async () => {
      const user = userEvent.setup();
      const onCardClick = vi.fn();
      const { container } = render(
        <ClassCard {...defaultProps} onCardClick={onCardClick} />
      );
      // Click on the card div, not a button
      const card = container.firstElementChild!;
      await user.click(card);
      expect(onCardClick).toHaveBeenCalledOnce();
    });

    it('should not call onCardClick when a button is clicked', async () => {
      const user = userEvent.setup();
      const onCardClick = vi.fn();
      const onFavoriteClick = vi.fn();
      render(
        <ClassCard
          {...defaultProps}
          onCardClick={onCardClick}
          onFavoriteClick={onFavoriteClick}
        />
      );
      // Click the favorite button
      const buttons = screen.getAllByRole('button');
      await user.click(buttons[0]!);
      expect(onCardClick).not.toHaveBeenCalled();
      expect(onFavoriteClick).toHaveBeenCalledOnce();
    });

    it('should call onStatusClick when status badge is clickable', async () => {
      const user = userEvent.setup();
      const onStatusClick = vi.fn();
      render(
        <ClassCard
          {...defaultProps}
          statusClickable
          onStatusClick={onStatusClick}
        />
      );
      // Find the status button
      const statusBtn = screen.getByRole('button', { name: /In Progress/ });
      await user.click(statusBtn);
      expect(onStatusClick).toHaveBeenCalledOnce();
    });

    it('should render favorite button when onFavoriteClick is provided', () => {
      render(<ClassCard {...defaultProps} onFavoriteClick={() => {}} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('should render menu button when onMenuClick is provided', () => {
      render(<ClassCard {...defaultProps} onMenuClick={() => {}} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('keeps favorite and menu icon buttons at the 44px touch floor', () => {
      render(
        <ClassCard
          {...defaultProps}
          onFavoriteClick={() => {}}
          onMenuClick={() => {}}
        />
      );

      const favoriteButton = screen.getByRole('button', { name: 'Add favorite' });
      const menuButton = screen.getByRole('button', { name: 'More class actions' });

      expect(favoriteButton.className).toContain('min-h-11');
      expect(favoriteButton.className).toContain('min-w-11');
      expect(menuButton.className).toContain('min-h-11');
      expect(menuButton.className).toContain('min-w-11');
    });
  });

  describe('status grammar', () => {
    it.each([
      ['none', 'Not started'],
      ['setup', 'Setup'],
      ['briefing', 'Briefing'],
      ['break', 'Break'],
      ['start-time', 'Upcoming'],
      ['in-progress', 'In Progress'],
      ['offline-scoring', 'Offline scoring'],
      ['completed', 'Completed'],
    ] as const)('should render %s through the shared descriptor', (status, label) => {
      render(<ClassCard {...defaultProps} status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('should render warnings when provided', () => {
    render(
      <ClassCard
        {...defaultProps}
        warnings={<div data-testid="warning">Offline</div>}
      />
    );
    expect(screen.getByTestId('warning')).toBeInTheDocument();
  });

  it('should render custom actions', () => {
    render(
      <ClassCard
        {...defaultProps}
        actions={<button>Extra Action</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Extra Action' })).toBeInTheDocument();
  });

  it('should have displayName', () => {
    expect(ClassCard.displayName).toBe('ClassCard');
  });
});
