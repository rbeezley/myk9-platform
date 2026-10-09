import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { fromPartial } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { DogRow, type DogRowData } from '../DogTableRow';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import {
  DOG_ROW_HEIGHT,
  getDogEligibilityStatus,
  getDogRowHeight,
} from '../DogSelectionStepEnhanced.helpers';

const dog = (overrides: Partial<Dog>): Dog =>
  fromPartial<Dog>({
    id: 'dog-1',
    callName: 'Cracker',
    name: 'Cracker',
    breed: 'Border Collie',
    registrations: [],
    status: 'active',
    ...overrides,
  });

const renderRow = (d: Dog) => {
  const data: DogRowData = {
    dogs: [d],
    selectedDogs: [],
    onToggle: () => {},
    getDogEligibilityStatus,
    showRegistryId: undefined,
  };
  return render(<DogRow index={0} style={{}} data={data} />);
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

describe('DogRow ineligible reason (MYK9-1060)', () => {
  it('shows a too-young dog disabled, with the reason visible and wired to the row', () => {
    renderRow(dog({ dateOfBirth: daysAgo(0) }));
    const row = screen.getByRole('checkbox', { name: 'Select Cracker' });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    const reason = screen.getByText(/Too young \(must be 6\+ months\) — born/);
    expect(reason).toBeVisible();
    // Never truncated: at the table's narrow name column an ellipsis would hide
    // the requirement and the DOB from touch users (docs/INTENT.md: no hover-only).
    expect(reason).not.toHaveClass('truncate');
    expect(reason.textContent).toBe(
      `Too young (must be 6+ months) — born ${formatDateMMDDYYYY(daysAgo(0))}`
    );
    expect(row.getAttribute('aria-describedby')?.split(' ')).toContain(reason.id);
  });

  it('shows the same reason in a tooltip on hover', async () => {
    const { user } = renderRow(dog({ dateOfBirth: daysAgo(0) }));
    await user.hover(screen.getByRole('checkbox', { name: 'Select Cracker' }));
    // Exact text: the inline line reads "... — born <date>", so only the
    // tooltip's own line matches this string.
    expect(await screen.findByText('Too young (must be 6+ months)')).toBeInTheDocument();
  });

  it('shows no reason for an eligible dog', () => {
    renderRow(dog({ dateOfBirth: '2020-01-01' }));
    const row = screen.getByRole('checkbox', { name: 'Select Cracker' });
    expect(row).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText(/too young/i)).not.toBeInTheDocument();
  });
});

describe('ineligible row height (MYK9-1060)', () => {
  it('gives a row with a reason more room than the 44px minimum', () => {
    expect(getDogRowHeight(false)).toBeGreaterThan(DOG_ROW_HEIGHT);
    expect(getDogRowHeight(true)).toBe(DOG_ROW_HEIGHT);
  });
});
