import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { setupCsvCapture } from '@/test/utils/csvCapture';
import type { User } from '@/types/user-types';
import { PeopleBulkBar, exportPeopleCSV } from '../PeopleBulkBar';

function person(overrides: Partial<User>): User {
  return { id: overrides.id ?? 'p', firstName: 'A', lastName: 'B', ...overrides } as User;
}

const SELECTED: User[] = [
  person({ id: 'p-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }),
  person({ id: 'p-2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }),
];

describe('PeopleBulkBar', () => {
  it('renders nothing with no selection', () => {
    render(<PeopleBulkBar selectedPeople={[]} onClearSelection={vi.fn()} />);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('shows the count and no role-editing or delete action', () => {
    render(<PeopleBulkBar selectedPeople={SELECTED} onClearSelection={vi.fn()} />);
    expect(screen.getByText('2 people selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy emails' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /role/i })).not.toBeInTheDocument();
  });

  it('copies the selected emails to the clipboard', async () => {
    render(<PeopleBulkBar selectedPeople={SELECTED} onClearSelection={vi.fn()} />);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    fireEvent.click(screen.getByRole('button', { name: 'Copy emails' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('ada@example.com, grace@example.com')
    );
  });

  it('clears the selection from the bar', () => {
    const onClearSelection = vi.fn();
    render(<PeopleBulkBar selectedPeople={SELECTED} onClearSelection={onClearSelection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });
});

describe('exportPeopleCSV', () => {
  it('builds a CSV with the selected people only', async () => {
    const capture = setupCsvCapture();

    exportPeopleCSV(SELECTED);

    const csv = await capture.getCsv();
    expect(csv).toContain('Ada Lovelace,ada@example.com');
    expect(csv).toContain('Grace Hopper,grace@example.com');
    capture.restore();
  });
});
