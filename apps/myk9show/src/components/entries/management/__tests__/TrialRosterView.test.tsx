import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { TrialRosterView, type RosterEntry } from '../TrialRosterView';

const entries: RosterEntry[] = [
  {
    id: 'entry-1',
    armband: '101',
    dogName: 'Willow',
    breed: 'Border Collie',
    handlerName: 'Taylor Handler',
    className: 'Novice A',
    classId: 'class-1',
    isScored: false,
    checkInStatus: null,
  },
];

describe('TrialRosterView', () => {
  it('renders each class roster with the standard DataTable toolbar', () => {
    render(<TrialRosterView entries={entries} onClassClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compact density/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset table view/i })).toBeInTheDocument();
  });
});
