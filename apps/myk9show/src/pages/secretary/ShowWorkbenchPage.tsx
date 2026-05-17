import { useMemo } from 'react';
import { ClipboardCheck, ListChecks, Medal, Pencil } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { NotFoundState } from '@/components/common/NotFoundState';
import {
  PrimaryTabs,
  PrimaryTabsContent,
  type PrimaryTabDef,
} from '@/components/common/PrimaryTabs';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { isShowWorkbenchPhase, useActivePhase } from '@/hooks/useActivePhase';

const PHASE_TABS: PrimaryTabDef[] = [
  { id: 'setup', label: 'Setup', icon: ListChecks },
  { id: 'today', label: 'Today', icon: ClipboardCheck },
  { id: 'wrap-up', label: 'Wrap-up', icon: Medal },
];

function PhaseShell({ title, kicker }: { title: string; kicker: string }) {
  return (
    <section className="space-y-3 pt-6" aria-label={title}>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{kicker}</p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
    </section>
  );
}

export function ShowWorkbenchPage() {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const [activePhase, setActivePhase] = useActivePhase();
  const { show: currentShow, isLoading, isError, refetch } = useFastShowDetails(showId);

  const breadcrumbs = useMemo(
    () => [
      { label: 'Secretary', href: '/secretary/dashboard' },
      {
        label: currentShow?.name || 'Show Workbench',
        href: showId ? `/secretary/shows/${showId}` : '/secretary/dashboard',
      },
    ],
    [currentShow?.name, showId]
  );

  if (isLoading) {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" count={3} />
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell>
        <ErrorState
          message="We couldn't load this show workbench."
          onRetry={() => {
            void refetch?.();
          }}
        />
      </PageShell>
    );
  }

  if (!currentShow) {
    return (
      <PageShell>
        <NotFoundState
          entityName="Show"
          backTo="/secretary/dashboard"
          backLabel="Back to Dashboard"
        />
      </PageShell>
    );
  }

  function handlePhaseChange(value: string) {
    if (isShowWorkbenchPhase(value)) {
      setActivePhase(value);
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={`${currentShow.name || 'Show'} workbench`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/shows/${currentShow.id}?edit=true`)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        }
      />

      <DetailHero
        cover={
          currentShow.startDate ? (
            <ShowDateBlock startDate={currentShow.startDate} endDate={currentShow.endDate} />
          ) : undefined
        }
        name={currentShow.name || 'Untitled Show'}
        subtitle={currentShow.clubName || undefined}
        badges={
          currentShow.organization
            ? [{ label: currentShow.organization, variant: 'default' as const }]
            : []
        }
        secondaryActions={<ShowStatusPill showId={currentShow.id} status={currentShow.status} />}
        footer={<QuickInfoCards show={currentShow} />}
      />

      <PrimaryTabs tabs={PHASE_TABS} value={activePhase} onValueChange={handlePhaseChange}>
        <PrimaryTabsContent value="setup">
          <PhaseShell title="Setup" kicker="Before the show" />
        </PrimaryTabsContent>
        <PrimaryTabsContent value="today">
          <PhaseShell title="Today" kicker="Live operations" />
        </PrimaryTabsContent>
        <PrimaryTabsContent value="wrap-up">
          <PhaseShell title="Wrap-up" kicker="After the show" />
        </PrimaryTabsContent>
      </PrimaryTabs>
    </PageShell>
  );
}

export default ShowWorkbenchPage;
