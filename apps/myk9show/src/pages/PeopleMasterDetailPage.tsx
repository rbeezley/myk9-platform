import React from 'react';
import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MASTER_DETAIL_QUERY } from '@/components/layout/MasterDetailLayout';
import { PageTransition } from '@/components/common/PageTransition';
import BrowsePeoplePage from './BrowsePeoplePage';
import PersonDetailPage from './PersonDetailPage';

/**
 * The one route element for `/people` and `/people/:id`.
 *
 * It is a single route (not two) so the list stays mounted when the person changes: its scroll
 * position, filters and selection survive a click. Wide screens are always split, list left and
 * person right (a prompt until someone is picked); narrow ones keep the page hop (the person
 * replaces the list).
 *
 * `PageTransition` is keyed by pathname, so it wraps only the person, never the list.
 */
const PeopleMasterDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);

  const person = id ? (
    <PageTransition>
      <PersonDetailPage />
    </PageTransition>
  ) : null;

  if (!isWide) return id ? person : <BrowsePeoplePage />;

  return (
    <BrowsePeoplePage
      detail={
        person ?? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Users className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">Select a person to see their details</p>
          </div>
        )
      }
    />
  );
};

export default PeopleMasterDetailPage;
