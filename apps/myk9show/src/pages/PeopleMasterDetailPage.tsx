import React from 'react';
import { Users } from 'lucide-react';
import { MasterDetailRoute } from '@/components/layout/MasterDetailRoute';
import BrowsePeoplePage from './BrowsePeoplePage';
import PersonDetailPage from './PersonDetailPage';

/** The one route element for `/people` and `/people/:id` (see `MasterDetailRoute`). */
const PeopleMasterDetailPage: React.FC = () => (
  <MasterDetailRoute
    List={BrowsePeoplePage}
    Detail={PersonDetailPage}
    EmptyIcon={Users}
    emptyText="Select a person to see their details"
  />
);

export default PeopleMasterDetailPage;
