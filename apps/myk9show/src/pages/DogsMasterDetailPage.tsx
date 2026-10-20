import React from 'react';
import { PawPrint } from 'lucide-react';
import { MasterDetailRoute } from '@/components/layout/MasterDetailRoute';
import { useRosterIsOwnDogsOnly } from '@/hooks/useRoleBasedData';
import BrowseDogsPage from './BrowseDogsPage';
import DogDetailPage from './DogDetailPage';

/** The one route element for `/dogs` and `/dogs/:id` (see `MasterDetailRoute`). */
const DogsMasterDetailPage: React.FC = () => {
  // Same title rule as the list page: the data scope, not the role (MYK9-237).
  const ownDogsOnly = useRosterIsOwnDogsOnly();
  return (
    <MasterDetailRoute
      List={BrowseDogsPage}
      Detail={DogDetailPage}
      EmptyIcon={PawPrint}
      emptyText="Select a dog to see its details"
      crumb={{ label: ownDogsOnly ? 'My Dogs' : 'Dogs', href: '/dogs' }}
    />
  );
};

export default DogsMasterDetailPage;
