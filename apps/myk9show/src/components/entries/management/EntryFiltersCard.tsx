import type { FC } from 'react';
import { CreditCard } from 'lucide-react';
import { SearchBar } from '@/components/common/SearchBar';
import { FilterBar } from '@/components/common/FilterBar';
import type { FilterDefinition, FilterBarState } from '@/components/common/FilterBar';
import { PaymentStatus } from '@/types/show-registration-types';

interface EntryFiltersCardProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  paymentFilter: string;
  setPaymentFilter: (payment: string) => void;
}

const PAYMENT_FILTER_KEY = 'payment';

const PAYMENT_FILTER_DEFS: FilterDefinition[] = [
  {
    key: PAYMENT_FILTER_KEY,
    label: 'Payment',
    type: 'select',
    icon: CreditCard,
    options: [
      { label: 'Payment Due', value: PaymentStatus.PENDING },
      { label: 'Paid Online', value: PaymentStatus.PAID_ONLINE },
      { label: 'Paid by Check', value: PaymentStatus.PAID_BY_CHECK },
      { label: 'Refunded', value: PaymentStatus.REFUNDED },
    ],
  },
];

/**
 * Compact filter bar for entry management.
 *
 * INTENT: Entry *status* is filtered exclusively by the tab row below this bar
 * (All / Pending / Accepted / Waitlist / Issues / Move-Ups / Pulled), so this
 * bar deliberately carries no status dropdown — a second status control would
 * let the user set contradictory state (e.g. "Pending" tab + "Accepted" filter
 * = 0 rows). The only structured filter here is Payment, surfaced as a pill
 * through the shared `FilterBar` so it stays hidden until the secretary opts in.
 * Search is the primary triage tool and uses the shared `SearchBar` (same chrome
 * as Browse Shows / Dogs / People) so the secretary sees one search affordance
 * app-wide.
 */
export const EntryFiltersCard: FC<EntryFiltersCardProps> = ({
  searchTerm,
  setSearchTerm,
  paymentFilter,
  setPaymentFilter,
}) => {
  const filterBarState: FilterBarState = {
    filters: paymentFilter !== 'all' ? { [PAYMENT_FILTER_KEY]: paymentFilter } : {},
    sortKey: null,
    sortDirection: 'asc',
  };

  const handleFilterBarChange = (next: FilterBarState) => {
    setPaymentFilter((next.filters[PAYMENT_FILTER_KEY] as string) || 'all');
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search entries..."
        aria-label="Search entries"
        size="sm"
        className="flex-1 min-w-[200px] max-w-sm"
      />

      <FilterBar
        filterDefs={PAYMENT_FILTER_DEFS}
        state={filterBarState}
        onStateChange={handleFilterBarChange}
      />
    </div>
  );
};

export default EntryFiltersCard;
