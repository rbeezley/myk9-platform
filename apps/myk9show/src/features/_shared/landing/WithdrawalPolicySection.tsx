import type { CSSProperties } from 'react';
import { useEffectiveWithdrawalPolicy } from '@/features/payments/useEffectiveWithdrawalPolicy';
import { SERVICE_FEE_SENTENCE } from '@/features/payments/withdrawalPolicyText';
import { WITHDRAWAL_POLICY_ROW_LABEL } from '@/features/premium/premiumFacts';

interface WithdrawalPolicySectionProps {
  showId: string | null | undefined;
  /** Per-theme tuning from the hosting landing, like OfferedClassesSection. */
  className?: string;
  style?: CSSProperties;
}

/**
 * MYK9-1976: the show's refund and withdrawal policy on its public landing, right after the
 * fees and entry facts, in the words an exhibitor reads at checkout: the show's text, else the
 * club's, else the default for the show's registry. Read the way the show's About facts read
 * it (`useEffectiveWithdrawalPolicy`), which works signed out: `shows`, `clubs` and `trials`
 * are anon-readable for a public show.
 *
 * Plain text with its line breaks kept, never cut, and always followed by the service-fee
 * sentence. One component for all eight styles, like OfferedClassesSection, so no style can
 * drop it; it inherits the host's colour and fonts.
 */
export function WithdrawalPolicySection({
  showId,
  className,
  style,
}: WithdrawalPolicySectionProps) {
  const policy = useEffectiveWithdrawalPolicy(showId);
  // Nothing while the read is in flight: no empty shell on a public page.
  if (!showId || policy.isLoading) return null;

  return (
    <section
      data-testid="landing-withdrawal-policy"
      aria-labelledby="landing-withdrawal-policy-heading"
      className={className}
      style={{ color: 'currentColor', ...style }}
    >
      <h2 id="landing-withdrawal-policy-heading">{WITHDRAWAL_POLICY_ROW_LABEL}</h2>
      {policy.data ? (
        <p style={{ whiteSpace: 'pre-line', marginTop: '0.75em' }}>{policy.data.text}</p>
      ) : (
        <p style={{ marginTop: '0.75em' }}>
          The refund and withdrawal policy could not be loaded. Ask the show secretary before you
          enter.
        </p>
      )}
      <p style={{ marginTop: '0.75em' }}>{SERVICE_FEE_SENTENCE}</p>
    </section>
  );
}
