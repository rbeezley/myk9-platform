import React from 'react';
import { Building2 } from 'lucide-react';
import { MasterDetailRoute } from '@/components/layout/MasterDetailRoute';
import BrowseClubsPage from './BrowseClubsPage';
import ClubDetailPage from './ClubDetailPage';

/** The one route element for `/clubs` and `/clubs/:id` (see `MasterDetailRoute`). */
const ClubsMasterDetailPage: React.FC = () => (
  <MasterDetailRoute
    List={BrowseClubsPage}
    Detail={ClubDetailPage}
    EmptyIcon={Building2}
    emptyText="Select a club to see its details"
  />
);

export default ClubsMasterDetailPage;
