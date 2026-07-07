import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  ChevronRight,
  LifeBuoy,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useSystemHealthSnapshots } from '@/features/admin-system-health/useSystemHealthSnapshots';
import {
  deriveEffectiveStatus,
  formatCheckedAgo,
} from '@/features/admin-system-health/systemHealthSelectors';
import { useSupportTickets } from '@/features/support/useSupportTickets';
import type {
  CheckStatus,
  SystemHealthSnapshot,
} from '@/features/admin-system-health/systemHealthTypes';
import type { SupportTicket } from '@/features/support/supportTickets';

type SummaryTone = 'ok' | 'warn' | 'fail' | 'muted';

interface SummaryItem {
  title: string;
  value: string;
  detail: string;
  href: string;
  tone: SummaryTone;
  icon: React.ComponentType<{ className?: string }>;
}

const TONE_CLASS: Record<SummaryTone, string> = {
  ok: 'border-success/30 bg-success/5',
  warn: 'border-warning/40 bg-warning/5',
  fail: 'border-destructive/35 bg-destructive/5',
  muted: 'border-border bg-card',
};

const TONE_BADGE: Record<SummaryTone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ok: 'secondary',
  warn: 'outline',
  fail: 'destructive',
  muted: 'outline',
};

function isSyncCheck(check: SystemHealthSnapshot['checks'][number]): boolean {
  const text = `${check.key} ${check.label}`.toLowerCase();
  return text.includes('sync') || text.includes('replication') || text.includes('queue');
}

function isDegraded(status: CheckStatus): boolean {
  return status === 'warn' || status === 'fail' || status === 'unknown';
}

function healthItem(
  latest: SystemHealthSnapshot | null,
  isLoading: boolean,
  hasError: boolean,
  now: number
): SummaryItem {
  if (isLoading) {
    return {
      title: 'System Health',
      value: 'Checking',
      detail: 'Loading the latest health run.',
      href: '/admin/health',
      tone: 'muted',
      icon: Activity,
    };
  }

  if (hasError) {
    return {
      title: 'System Health',
      value: 'Unavailable',
      detail: 'Open Health to inspect the failed signal.',
      href: '/admin/health',
      tone: 'warn',
      icon: AlertTriangle,
    };
  }

  const effective = deriveEffectiveStatus(latest, now);
  if (effective.isEmpty) {
    return {
      title: 'System Health',
      value: 'No run recorded',
      detail: 'The daily health job has not reported yet.',
      href: '/admin/health',
      tone: 'fail',
      icon: AlertTriangle,
    };
  }

  const labels = {
    ok: 'All systems healthy',
    warn: 'Warnings found',
    fail: effective.isStale ? 'Run overdue' : 'Attention needed',
  };

  return {
    title: 'System Health',
    value: labels[effective.status],
    detail: `Last run ${formatCheckedAgo(latest?.createdAt ?? null, now)}.`,
    href: '/admin/health',
    tone: effective.status === 'ok' ? 'ok' : effective.status,
    icon: effective.status === 'ok' ? Activity : AlertTriangle,
  };
}

function supportItem(
  tickets: SupportTicket[] | undefined,
  isLoading: boolean,
  hasError: boolean
): SummaryItem {
  if (isLoading) {
    return {
      title: 'Support',
      value: 'Checking',
      detail: 'Loading open tickets.',
      href: '/admin/support',
      tone: 'muted',
      icon: LifeBuoy,
    };
  }

  if (hasError) {
    return {
      title: 'Support',
      value: 'Unavailable',
      detail: 'Open Support to inspect the ticket queue.',
      href: '/admin/support',
      tone: 'warn',
      icon: LifeBuoy,
    };
  }

  const openTickets = (tickets ?? []).filter(ticket => ticket.status !== 'resolved');
  const showDayTickets = openTickets.filter(ticket => ticket.isShowDayPriority);
  const detail =
    showDayTickets.length > 0
      ? `${showDayTickets.length} show-day priority.`
      : 'No show-day priority tickets.';

  return {
    title: 'Support',
    value: `${openTickets.length} open`,
    detail,
    href: '/admin/support',
    tone: showDayTickets.length > 0 ? 'fail' : openTickets.length > 0 ? 'warn' : 'ok',
    icon: LifeBuoy,
  };
}

function syncItem(latest: SystemHealthSnapshot | null): SummaryItem {
  const syncCheck = latest?.checks.find(check => isSyncCheck(check) && isDegraded(check.status));
  if (!syncCheck) {
    return {
      title: 'Sync Monitoring',
      value: 'Review',
      detail: 'Open the sync owner surface for device and queue details.',
      href: '/admin/sync',
      tone: 'muted',
      icon: RefreshCw,
    };
  }

  return {
    title: 'Sync Monitoring',
    value: syncCheck.status === 'fail' ? 'Issue found' : 'Needs review',
    detail: syncCheck.detail || syncCheck.label,
    href: '/admin/sync',
    tone: syncCheck.status === 'fail' ? 'fail' : 'warn',
    icon: RefreshCw,
  };
}

function deletedItemsItem(): SummaryItem {
  return {
    title: 'Deleted Items',
    value: 'Recovery',
    detail: 'Open restore tools when a support ticket points to missing data.',
    href: '/admin/deleted-items',
    tone: 'muted',
    icon: ArchiveRestore,
  };
}

function SummaryCard({ item }: { item: SummaryItem }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      className={`group block rounded-md border p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${TONE_CLASS[item.tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">{item.title}</h3>
        </div>
        <Badge variant={TONE_BADGE[item.tone]}>{item.value}</Badge>
      </div>
      <p className="mt-3 min-h-[40px] text-sm text-muted-foreground">{item.detail}</p>
      <div className="mt-3 flex items-center gap-1 text-sm font-medium text-primary">
        <span>Open owner surface</span>
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export function PlatformHealthSummary() {
  const health = useSystemHealthSnapshots();
  const support = useSupportTickets();
  const [now] = useState(() => Date.now());
  const latest = health.data?.latest ?? null;
  const items = [
    healthItem(latest, health.isLoading, !!health.error, now),
    supportItem(support.data, support.isLoading, !!support.error),
    syncItem(latest),
    deletedItemsItem(),
  ];

  return (
    <section className="mb-10" aria-labelledby="platform-health-summary-heading">
      <div className="mb-4">
        <h2 id="platform-health-summary-heading" className="text-xl font-semibold leading-tight">
          Platform Health
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Current troubleshooting signals with direct paths to the surfaces that own the fix.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map(item => (
          <SummaryCard key={item.title} item={item} />
        ))}
      </div>
    </section>
  );
}
