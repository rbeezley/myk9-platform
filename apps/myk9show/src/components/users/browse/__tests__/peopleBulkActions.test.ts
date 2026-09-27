import { describe, it, expect, vi } from 'vitest';
import { setupCsvCapture } from '@/test/utils/csvCapture';
import type { User } from '@/types/user-types';
import { copyPeopleEmails, exportPeopleCSV, getFullName } from '../peopleBulkActions';

function person(overrides: Partial<User>): User {
  return { id: overrides.id ?? 'p', firstName: 'A', lastName: 'B', ...overrides } as User;
}

const SELECTED: User[] = [
  person({ id: 'p-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }),
  person({ id: 'p-2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }),
];

describe('getFullName', () => {
  it('joins first and last name, falling back to Unknown', () => {
    expect(getFullName(SELECTED[0])).toBe('Ada Lovelace');
    expect(getFullName(person({ firstName: '', lastName: '' }))).toBe('Unknown');
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

describe('copyPeopleEmails', () => {
  it('copies every selected email, joined with a comma', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await copyPeopleEmails(SELECTED);

    expect(writeText).toHaveBeenCalledWith('ada@example.com, grace@example.com');
  });

  it('does nothing when no selected person has an email', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await copyPeopleEmails([person({ email: undefined })]);

    expect(writeText).not.toHaveBeenCalled();
  });
});
