import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AboutThisPhase } from '../AboutThisPhase';

describe('AboutThisPhase', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders secretary-specific copy for each phase', () => {
    const { rerender } = render(<AboutThisPhase phase="setup" showId="show-1" />);

    expect(screen.getByRole('heading', { name: 'About Setup' })).toBeInTheDocument();
    expect(
      screen.getByText(/confirm the schedule, judges, show page, and materials/i)
    ).toBeInTheDocument();

    rerender(<AboutThisPhase phase="today" showId="show-1" />);
    expect(screen.getByRole('heading', { name: 'About Today' })).toBeInTheDocument();
    expect(screen.getByText(/keep rings moving/i)).toBeInTheDocument();

    rerender(<AboutThisPhase phase="wrap-up" showId="show-1" />);
    expect(screen.getByRole('heading', { name: 'About Wrap-up' })).toBeInTheDocument();
    expect(screen.getByText(/submit final files/i)).toBeInTheDocument();
  });

  it('dismisses the strip and stores the choice by show and phase', async () => {
    const { user, rerender } = render(<AboutThisPhase phase="today" showId="show-1" />);

    await user.click(screen.getByRole('button', { name: 'Dismiss About Today' }));

    expect(screen.queryByRole('heading', { name: 'About Today' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('myk9show:workbench-about-dismissed:show-1:today')).toBe(
      'true'
    );

    rerender(<AboutThisPhase phase="today" showId="show-1" />);
    expect(screen.queryByRole('heading', { name: 'About Today' })).not.toBeInTheDocument();

    rerender(<AboutThisPhase phase="today" showId="show-2" />);
    expect(screen.getByRole('heading', { name: 'About Today' })).toBeInTheDocument();
  });
});
