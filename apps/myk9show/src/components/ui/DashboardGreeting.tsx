import { useMemo } from 'react';
import { FadeIn } from '@/components/layout/FadeIn';
import { getLoginGreeting } from '@/utils/greetings';

interface DashboardGreetingProps {
  firstName: string | null;
  subtitle?: string;
  className?: string;
  /** Heading level for the greeting. Pass `h1` when this is the page title. */
  as?: 'p' | 'h1';
}

/**
 * Personalized greeting for role dashboards.
 * Text styling is controlled by the caller via `className`.
 */
export function DashboardGreeting({ firstName, subtitle, className, as }: DashboardGreetingProps) {
  const greeting = useMemo(() => getLoginGreeting(firstName || 'there'), [firstName]);
  const Tag = as ?? 'p';

  return (
    <FadeIn direction="up" distance={8} duration={0.5}>
      <Tag className={className ?? 'text-2xl font-semibold tracking-tight'}>{greeting}</Tag>
      {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
    </FadeIn>
  );
}
