import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AboutThisPhase } from '../AboutThisPhase';

// Phase B5: only the Setup-phase About copy survives. Today and Wrap-up
// helpers were removed alongside their tabs.
describe('AboutThisPhase', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the Setup phase copy', () => {
    render(<AboutThisPhase phase="setup" showId="show-1" />);

    expect(screen.getByRole('heading', { name: 'About Setup' })).toBeInTheDocument();
    expect(
      screen.getByText(/confirm the schedule, judges, show page, and materials/i)
    ).toBeInTheDocument();
  });

  it('dismisses the strip and stores the choice by show and phase', async () => {
    const { user, rerender } = render(<AboutThisPhase phase="setup" showId="show-1" />);

    await user.click(screen.getByRole('button', { name: 'Dismiss About Setup' }));

    expect(screen.queryByRole('heading', { name: 'About Setup' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('myk9show:workbench-about-dismissed:show-1:setup')).toBe(
      'true'
    );

    rerender(<AboutThisPhase phase="setup" showId="show-1" />);
    expect(screen.queryByRole('heading', { name: 'About Setup' })).not.toBeInTheDocument();

    rerender(<AboutThisPhase phase="setup" showId="show-2" />);
    expect(screen.getByRole('heading', { name: 'About Setup' })).toBeInTheDocument();
  });
});
