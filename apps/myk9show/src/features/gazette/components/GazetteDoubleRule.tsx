import { cn } from '@/lib/utils';

interface GazetteDoubleRuleProps {
  /** Default ink — pass 'brown' for the sub-section variant. */
  variant?: 'ink' | 'brown';
  className?: string;
}

/**
 * 4px double horizontal rule — the signature section divider. Renders as a
 * hairline-thin <hr> so it can drop into any flow layout without margin
 * collapse surprises. Color flips to brown via `.brown` modifier.
 */
export function GazetteDoubleRule({ variant = 'ink', className }: GazetteDoubleRuleProps) {
  return (
    <hr
      role="separator"
      aria-orientation="horizontal"
      className={cn('gz-doublerule', variant === 'brown' && 'brown', className)}
    />
  );
}
