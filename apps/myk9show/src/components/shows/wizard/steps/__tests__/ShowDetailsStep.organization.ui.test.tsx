import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';
import type { ShowDraft } from '@/store/wizardStore';
import { BasicsSection } from '../sections/BasicsSection';

vi.mock('@/components/common/LazyComponents', () => ({ VenuePinMap: () => null }));
vi.mock('@/features/maps/VenueAddressAutocomplete', () => ({
  VenueAddressAutocomplete: () => null,
}));

const show: ShowDraft = {
  name: 'Existing show',
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

describe('ShowDetailsStep organization field', () => {
  it('shows the persisted organization as read-only with separate-show guidance', () => {
    render(
      <BasicsSection
        show={show}
        onUpdate={vi.fn()}
        clubField={null}
        organizationDisabled
        organizationValue="UKC"
        organizationHint="This show already has trials. Create a separate show instead."
      />
    );

    const organization = screen.getByRole('combobox', { name: /organization/i });
    expect(organization).toBeDisabled();
    expect(organization).toHaveTextContent('UKC');
    expect(screen.getByTestId('organization-guidance')).toHaveTextContent(
      /create a separate show/i
    );
  });
});
