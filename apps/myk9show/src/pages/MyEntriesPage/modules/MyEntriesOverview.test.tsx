import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { day, makeClass, makeRow, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyEntriesOverview } from './MyEntriesOverview';

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({ earnedAbbreviations: [], isLoading: false }),
}));

const dogs = [{ id: 'dog-rex', call_name: 'Rex' }];
const baseProps = {
  showMoney: false,
  currentFees: 0,
  amountDue: 0,
  hasPastBalance: false,
  currentFeesHref: '/payments',
  onNavigate: vi.fn(),
  dogs,
  onAddDog: vi.fn(),
};

describe('MyEntriesOverview (MYK9-1210)', () => {
  it('counts a dog’s upcoming classes from the entries it is given', () => {
    const entries = toOrders([
      makeRow({
        showDate: day('2099-12-05'),
        showEndDate: day('2099-12-06'),
        classes: [makeClass({ id: 'c1', trialDate: day('2099-12-05') })],
      }),
    ]);
    render(<MyEntriesOverview {...baseProps} entries={entries} />);
    expect(screen.getByText('1 upcoming class')).toBeInTheDocument();
  });

  it('requires entries, so a caller cannot silently show "No upcoming classes"', () => {
    // @ts-expect-error entries is required: omitting it must be a type error
    const props: ComponentProps<typeof MyEntriesOverview> = baseProps;
    expect(props).toBeDefined();
  });
});
