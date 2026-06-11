import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface QuickActionsSectionProps {
  showId: string;
  pendingEntriesCount: number;
  reportsReadyCount: number;
  activeTrialsCount: number;
}

interface QuickActionCardProps {
  count: number;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  borderClass: string;
  numberClass: string;
}

function QuickActionCard({
  count,
  title,
  subtitle,
  ctaLabel,
  href,
  borderClass,
  numberClass,
}: QuickActionCardProps) {
  return (
    <div className={`flex-1 rounded-lg border-l-4 bg-card p-4 shadow-sm ${borderClass}`}>
      <p className={`text-3xl font-bold ${numberClass}`}>{count}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
        <Link to={href}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}

export function QuickActionsSection({
  showId,
  pendingEntriesCount,
  reportsReadyCount,
  activeTrialsCount,
}: QuickActionsSectionProps) {
  if (!showId) return null;

  return (
    <div className="flex gap-3">
      <QuickActionCard
        count={pendingEntriesCount}
        title="Pending Entries"
        subtitle="awaiting review"
        ctaLabel="Review Entries"
        href={`/shows/${showId}/entry-management`}
        borderClass="border-blue-500"
        numberClass="text-blue-400"
      />
      <QuickActionCard
        count={reportsReadyCount}
        title="Reports Ready"
        subtitle="classes finalized"
        ctaLabel="Export Reports"
        href={`/shows/${showId}/reports`}
        borderClass="border-green-500"
        numberClass="text-green-400"
      />
      <QuickActionCard
        count={activeTrialsCount}
        title="Active Trials"
        subtitle="not yet completed"
        ctaLabel="Day of Ops"
        href="/secretary/day-of-operations"
        borderClass="border-amber-500"
        numberClass="text-amber-400"
      />
    </div>
  );
}
