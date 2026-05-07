import { useRevealOnScroll } from '../hooks/useRevealOnScroll';
import { heritageOrnaments } from '../tokens';

interface HeritageOrnamentRuleProps {
  /** Visual variant — ink (default) or gold for the lighter divider. */
  variant?: 'ink' | 'gold';
  /** Optional aria-hidden override; defaults to true since the rule is decorative. */
  ariaHidden?: boolean;
  className?: string;
}

/**
 * Heritage horizontal rule: thin line · ✦ · thin line.
 *
 * Animates on first reveal — both lines `scaleX(0) → scaleX(1)` from center
 * over 900ms, the diamond fades in 200ms after. Reduced-motion users see the
 * settled state instantly.
 *
 * Decorative by default — screen readers should not announce "sparkle".
 */
export function HeritageOrnamentRule({
  variant = 'ink',
  ariaHidden = true,
  className,
}: HeritageOrnamentRuleProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const classes = [
    'hl-rule-orn',
    variant === 'gold' ? 'gold' : '',
    revealed ? 'in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} className={classes} aria-hidden={ariaHidden}>
      <span className="l" />
      <span className="di">{heritageOrnaments.diamond}</span>
      <span className="l" />
    </div>
  );
}
