import type { CSSProperties } from 'react';
import type { PremiumRegistryStatementFact } from '@/features/premium/premiumFacts';

interface ScoutingStatementSectionProps {
  /** `LandingData.scoutingStatement`: the registry's words, or null when it requires none. */
  statement: PremiumRegistryStatementFact | null | undefined;
  /** Per-theme tuning from the hosting landing, like WithdrawalPolicySection. */
  className?: string;
  style?: CSSProperties;
}

/**
 * MYK9-2043: the registry's fixed statement about not scouting the trial location (AKC
 * Scent Work Regulations Ch. 3 §15), printed on the public landing right after the refund and
 * withdrawal policy, as the premium PDF prints it. The club types nothing; a registry with no
 * such rule (UKC, ASCA) prints nothing. One component for all eight styles, like
 * WithdrawalPolicySection, so no style can drop it; it inherits the host's colour and fonts.
 */
export function ScoutingStatementSection({
  statement,
  className,
  style,
}: ScoutingStatementSectionProps) {
  if (!statement) return null;

  return (
    <section
      data-testid="landing-scouting-statement"
      aria-labelledby="landing-scouting-statement-heading"
      className={className}
      style={{ color: 'currentColor', ...style }}
    >
      <h2 id="landing-scouting-statement-heading">{statement.label}</h2>
      <p style={{ marginTop: '0.75em' }}>{statement.text}</p>
    </section>
  );
}
