import { useMemo } from 'react';
import { FadeIn } from '@/components/layout/FadeIn';
import { getLoginGreeting } from '@/utils/greetings';

interface DashboardGreetingProps {
  firstName: string | null;
  subtitle?: string;
  className?: string;
}

/**
 * Personalized greeting for role dashboards.
 * Text styling is controlled by the caller via `className`.
 */
export function DashboardGreeting({ firstName, subtitle, className }: DashboardGreetingProps) {
  const greeting = useMemo(() => getLoginGreeting(firstName || 'there'), [firstName]);

  return (
    <FadeIn direction="up" distance={8} duration={0.5}>
      <p className={className ?? 'text-2xl font-semibold tracking-tight'}>{greeting}</p>
      {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
    </FadeIn>
  );
}
