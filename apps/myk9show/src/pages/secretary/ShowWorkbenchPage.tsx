import { useEffect, useMemo } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { ShowPresenceStack } from '@/features/show-presence/ShowPresenceStack';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { NotFoundState } from '@/components/common/NotFoundState';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { ShowContextNav } from '@/components/navigation/ShowContextNav';
import { useShowStore } from '@/store/showStore';

export function ShowWorkbenchPage() {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const { show: currentShow, isLoading, isError, refetch } = useFastShowDetails(showId);
  const selectShow = useShowStore(s => s.selectShow);

  // Keep the show store in sync so sub-components that read useShowStore work correctly.
  useEffect(() => {
    if (showId) selectShow(showId);
  }, [showId, selectShow]);

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

  return (
    <ShowPresenceProvider showId={showId}>
      <PageShell>
        <PageHeader
          breadcrumbs={breadcrumbs}
          title={`${currentShow.name || 'Show'} workbench`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <LiveUpdateIndicator />
              <ShowPresenceStack className="mr-1" />
              <Button asChild variant="outline" size="sm">
                <Link to={`/shows/${currentShow.id}`}>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview public page
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/shows/${currentShow.id}?edit=true`)}
              >
                {/* INTENT: full show editing stays on the existing show detail edit panel
                    until the Setup phase owns every edit surface. */}
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
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

        <ShowContextNav />

        <Outlet />
      </PageShell>
    </ShowPresenceProvider>
  );
}

export default ShowWorkbenchPage;
