import { Crown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PremiumButton } from './PremiumButton';

/**
 * Downgraded users keep access to their existing records, but mutations remain
 * a Premium capability. Keep this explanation and upgrade path consistent
 * across the Health, Training, and Pedigree views.
 */
export function PremiumReadOnlyNotice() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      role="note"
      className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 className="font-semibold">Records are read-only</h2>
        <p className="text-sm text-muted-foreground">
          Your existing records remain available to view, export, and delete. Upgrade to add or
          edit records.
        </p>
      </div>
      <PremiumButton
        variant="outline"
        size="md"
        icon={Crown}
        className="min-h-11 shrink-0"
        onClick={() =>
          navigate('/pricing-page', {
            state: { from: `${location.pathname}${location.search}` },
          })
        }
      >
        Upgrade to Premium
      </PremiumButton>
    </div>
  );
}
