import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ALL_PAYMENT_YEARS,
  type PaymentYearSelection,
} from '@/features/payments/paymentYearFilter';

/**
 * The page's one filter: which calendar year the ledger covers.
 *
 * The caller decides whether to render it at all (`canFilterPaymentYears`), so
 * a single-season exhibitor gets no control rather than a Select whose every
 * option shows the same rows — the inert-affordance trap this codebase keeps
 * paying for (the `SlideOverPanel` size prop, the 25 dead style classes in
 * #1696). That rule lives with the row data, not here, because "can this
 * filter hide anything" also depends on undated rows, which the year list
 * alone cannot see.
 *
 * Options are chronological and self-limiting, so the >4-options-per-decision
 * guideline is satisfied in spirit even for a long-tenured exhibitor: there is
 * no ranking judgment to make, and the list grows one row per season rather
 * than by product decision.
 */
export function PaymentYearFilter({
  years,
  value,
  onChange,
}: {
  years: string[];
  value: PaymentYearSelection;
  onChange: (year: PaymentYearSelection) => void;
}) {
  // Defensive only: with no years the Select would offer "All time" alone.
  // The real visibility decision is the caller's `canFilterPaymentYears`.
  if (years.length === 0) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      {/* min-h-11 keeps the trigger on the 44px touch floor the rest of this
          page holds to (see ExhibitorPaymentsPage's PaymentActionContent). */}
      <SelectTrigger
        aria-label="Filter payment history by year"
        className="min-h-11 w-[11rem]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PAYMENT_YEARS}>All time</SelectItem>
        {years.map(year => (
          <SelectItem key={year} value={year}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
