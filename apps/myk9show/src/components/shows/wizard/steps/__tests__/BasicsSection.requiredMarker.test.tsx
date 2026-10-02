/**
 * MYK9-931 (M13): the wizard hand-coded its required marker, which a screen
 * reader announces as "star", and carried no legend. It now uses the shared
 * RequiredMark ("(required)" for assistive tech) and says what the asterisk means.
 */
import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';
import type { ShowDraft } from '@/store/wizardStore';
import { BasicsSection } from '../sections/BasicsSection';
import { DatesEntrySection } from '../sections/DatesEntrySection';

vi.mock('@/components/common/LazyComponents', () => ({ VenuePinMap: () => null }));
vi.mock('@/features/maps/VenueAddressAutocomplete', () => ({
  VenueAddressAutocomplete: () => null,
}));

const SHOW: ShowDraft = {
  name: '',
  organization: 'UKC',
  location: '',
  latitude: null,
  longitude: null,
  startDate: '',
  endDate: '',
  entryOpenDate: '',
  entryCloseDate: '',
  preEntryFee: 0,
  dayOfShowFee: 0,
  startingArmbandNumber: 100,
  clubId: '',
  officials: { secretary: [], chairman: [], steward: [] },
  judgeIds: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
};

describe('wizard required markers', () => {
  it('names required fields "(required)" to assistive tech', () => {
    render(<BasicsSection show={SHOW} onUpdate={vi.fn()} clubField={null} />);
    expect(screen.getByRole('textbox', { name: /Show Name\s*\(required\)/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Timezone\s*\(required\)/ })).toBeInTheDocument();
  });

  it('leaves no bare asterisk that a screen reader would read as "star"', () => {
    const { container } = render(
      <>
        <BasicsSection show={SHOW} onUpdate={vi.fn()} clubField={null} />
        <DatesEntrySection show={SHOW} dateRangeValid entryDatesValid onUpdate={vi.fn()} />
      </>
    );
    const bare = Array.from(container.querySelectorAll('span')).filter(
      el => el.textContent?.trim() === '*' && el.getAttribute('aria-hidden') !== 'true'
    );
    expect(bare).toEqual([]);
  });

  it('explains the asterisk once, at the top of the step', () => {
    render(<BasicsSection show={SHOW} onUpdate={vi.fn()} clubField={null} />);
    expect(screen.getByTestId('required-legend')).toHaveTextContent('Required');
  });
});
