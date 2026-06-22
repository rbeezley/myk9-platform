import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrialScopeBar } from '../TrialScopeBar';

function renderBar(props: Partial<React.ComponentProps<typeof TrialScopeBar>> = {}) {
  const onRosterViewChange = vi.fn();
  render(
    <MemoryRouter>
      <TrialScopeBar
        rosterView={false}
        onRosterViewChange={onRosterViewChange}
        classId={null}
        {...props}
      />
    </MemoryRouter>
  );
  return { onRosterViewChange };
}

describe('TrialScopeBar', () => {
  it('marks List active when rosterView is false', () => {
    renderBar({ rosterView: false });
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Roster' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks Roster active when rosterView is true', () => {
    renderBar({ rosterView: true });
    expect(screen.getByRole('button', { name: 'Roster' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onRosterViewChange(true) when the Roster toggle is clicked', () => {
    const { onRosterViewChange } = renderBar({ rosterView: false });
    fireEvent.click(screen.getByRole('button', { name: 'Roster' }));
    expect(onRosterViewChange).toHaveBeenCalledWith(true);
  });

  it('hides the score deep-link until a class is selected', () => {
    renderBar({ classId: null });
    expect(screen.queryByRole('link', { name: /score this class/i })).not.toBeInTheDocument();
  });

  it('renders an explicit deep-link to the class scoresheet when a class is selected', () => {
    renderBar({ classId: 'class-9' });
    const link = screen.getByRole('link', { name: /score this class/i });
    expect(link).toHaveAttribute('href', '/scoring/classes/class-9/entries');
  });
});
