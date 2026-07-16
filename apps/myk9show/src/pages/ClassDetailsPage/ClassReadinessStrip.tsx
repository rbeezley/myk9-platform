import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  FileWarning,
  ListChecks,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  getClassDayOfHref,
  getClassMissingInformationHref,
  getClassPaymentDueHref,
  getClassReviewHref,
  getClassScoringHref,
} from '@/features/entry-operations/entryAttentionRoutes';
import {
  buildClassReadinessSummary,
  type ClassReadinessClassInput,
  type ClassReadinessEntry,
} from './classReadiness';

export interface ClassReadinessStripProps {
  isStaff: boolean;
  classData: ClassReadinessClassInput;
  entries: ReadonlyArray<ClassReadinessEntry>;
  showId: string | null | undefined;
  trialId: string | null | undefined;
  classId?: string | undefined;
  isLoading: boolean;
  error: string | null;
}

interface ReadinessMetricProps {
  label: string;
  value: string;
  href?: string | undefined;
  icon: React.ComponentType<{ className?: string }>;
  emphasized?: boolean | undefined;
}

const metricClassName =
  'flex min-h-[44px] items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors';

function ReadinessMetric({ label, value, href, icon: Icon, emphasized }: ReadinessMetricProps) {
  const content = (
    <>
      <Icon
        className={cn('h-4 w-4 shrink-0', emphasized ? 'text-warning' : 'text-muted-foreground')}
      />
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block text-sm font-medium text-foreground">{value}</span>
      </span>
    </>
  );

  if (!href) return <div className={metricClassName}>{content}</div>;

  return (
    <Link
      to={href}
      className={cn(
        metricClassName,
        'hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      aria-label={value}
    >
      {content}
    </Link>
  );
}

export function ClassReadinessStrip({
  isStaff,
  classData,
  entries,
  showId,
  trialId,
  classId,
  isLoading,
  error,
}: ClassReadinessStripProps) {
  if (!isStaff) return null;

  const classContext = showId && classId ? { showId, trialId: trialId ?? null, classId } : null;

  if (isLoading) {
    return (
      <section aria-label="Class readiness" className="mb-6">
        <Card>
          <CardContent className="py-4">
            <div role="status" aria-label="Loading class readiness" aria-busy="true">
              <div className="h-4 w-36 animate-pulse rounded bg-muted" />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="min-h-[44px] animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (error && entries.length === 0) {
    return (
      <section aria-label="Class readiness" className="mb-6">
        <Card>
          <CardContent className="py-4">
            <div
              role="status"
              aria-label="Class readiness unavailable"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
              Class readiness is unavailable until class entries load.
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  const summary = buildClassReadinessSummary(classData, entries);
  const reviewHref = classContext ? getClassReviewHref(classContext) : undefined;
  const missingInformationHref = classContext
    ? getClassMissingInformationHref(classContext)
    : undefined;
  const paymentDueHref = classContext ? getClassPaymentDueHref(classContext) : undefined;
  const dayOfHref = classContext ? getClassDayOfHref(classContext) : undefined;
  const scoringHref = classId ? getClassScoringHref(classId) : undefined;

  return (
    <section aria-label="Class readiness" className="mb-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Class readiness</CardTitle>
          <p className="text-sm text-muted-foreground">
            Factual progress for this class. Class status: {summary.classStatus}.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <ReadinessMetric
            label="Entries"
            value={`${summary.totalEntries} total entries`}
            icon={Users}
          />
          <ReadinessMetric
            label="Review"
            value={`${summary.pendingReviewCount} needs review`}
            href={reviewHref}
            icon={FileWarning}
            emphasized={summary.pendingReviewCount > 0}
          />
          <ReadinessMetric
            label="Missing information"
            value={`${summary.missingInformationCount} missing information`}
            href={missingInformationHref}
            icon={AlertCircle}
            emphasized={summary.missingInformationCount > 0}
          />
          <ReadinessMetric
            label="Payment"
            value={`${summary.paymentDueCount} payment due`}
            href={paymentDueHref}
            icon={CreditCard}
            emphasized={summary.paymentDueCount > 0}
          />
          <ReadinessMetric
            label="Check-in"
            value={`${summary.checkedInCount} of ${summary.checkInEligibleCount} checked in`}
            href={dayOfHref}
            icon={CheckCircle2}
          />
          <ReadinessMetric
            label="Scoring"
            value={`${summary.scoredCount} of ${summary.totalEntries} scored`}
            href={scoringHref}
            icon={ListChecks}
          />
        </CardContent>
      </Card>
    </section>
  );
}
