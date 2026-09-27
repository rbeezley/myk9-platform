/**
 * MYK9-831: the wizard never set trials.timezone, so a Tulsa, OK show's
 * trials silently persisted as America/New_York (the column default).
 * The show step now asks directly, defaulting to the browser's IANA zone —
 * this repo has no location-to-timezone lookup to derive one from the venue
 * address/pin instead.
 */
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ShowDraft } from '@/store/wizardStore';
import { BasicsSection } from '../sections/BasicsSection';

vi.mock('@/components/common/LazyComponents', () => ({ VenuePinMap: () => null }));
vi.mock('@/features/maps/VenueAddressAutocomplete', () => ({
  VenueAddressAutocomplete: () => null,
}));

const BASE: ShowDraft = {
  name: 'Tulsa Fairgrounds Show',
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

function timezoneField() {
  return screen.getByRole('combobox', { name: /timezone/i });
}

describe('BasicsSection timezone field', () => {
  let resolvedOptionsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resolvedOptionsSpy = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone: 'America/Denver' } as Intl.ResolvedDateTimeFormatOptions);
  });

  afterEach(() => {
    resolvedOptionsSpy.mockRestore();
  });

  it('defaults to the browser timezone when the draft has none set', () => {
    render(<BasicsSection show={{ ...BASE }} onUpdate={vi.fn()} clubField={null} />);
    expect(timezoneField()).toHaveTextContent('Mountain (MT)');
  });

  it('shows the persisted draft timezone instead of overriding it with the browser zone', () => {
    render(
      <BasicsSection
        show={{ ...BASE, timezone: 'America/Chicago' }}
        onUpdate={vi.fn()}
        clubField={null}
      />
    );
    expect(timezoneField()).toHaveTextContent('Central (CT)');
  });

  it('writes the picked zone back through onUpdate', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<BasicsSection show={{ ...BASE }} onUpdate={onUpdate} clubField={null} />);

    await user.click(timezoneField());
    await user.click(await screen.findByRole('option', { name: /pacific \(pt\)/i }));

    expect(onUpdate).toHaveBeenCalledWith({ timezone: 'America/Los_Angeles' });
  });
});
