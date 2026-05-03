import type { LucideIcon } from 'lucide-react';
import { Clock } from 'lucide-react';
import { PageShell } from './PageShell';

export interface ComingSoonPageProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

/**
 * Renders a calm "coming soon" placeholder for feature-flagged routes.
 * Flip features.* to true and replace the route element — no other changes needed.
 */
export function ComingSoonPage({
  title,
  description = 'Show entry and competition management is coming soon. Your dogs and training data will be ready and waiting when it arrives.',
  icon: Icon = Clock,
}: ComingSoonPageProps) {
  return (
    <PageShell>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="rounded-full bg-muted p-6">
          <Icon className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
    </PageShell>
  );
}
