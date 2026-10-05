import React from 'react';
import { PawPrint } from 'lucide-react';
import { MasterDetailRoute } from '@/components/layout/MasterDetailRoute';
import BrowseDogsPage from './BrowseDogsPage';
import DogDetailPage from './DogDetailPage';

/** The one route element for `/dogs` and `/dogs/:id` (see `MasterDetailRoute`). */
const DogsMasterDetailPage: React.FC = () => (
  <MasterDetailRoute
    List={BrowseDogsPage}
    Detail={DogDetailPage}
    EmptyIcon={PawPrint}
    emptyText="Select a dog to see its details"
  />
);

export default DogsMasterDetailPage;
