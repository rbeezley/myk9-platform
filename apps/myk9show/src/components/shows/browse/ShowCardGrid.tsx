import React from 'react';
import { ShowCardHorizontal } from './ShowCardHorizontal';
import { StaggeredGrid } from '@/components/layout/StaggeredGrid';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { UserWithRoles } from '@/types/auth-types';
import { showDistanceMiles, type LatLng } from '@/features/location/distance';

interface ShowCardGridProps {
  shows: EnhancedShow[];
  entries: SyncableShowEntry[];
  selectedTab: string;
  user: UserWithRoles | null;
  isSelected?: (item: EnhancedShow) => boolean;
  onToggleSelect?: (item: EnhancedShow) => void;
  /** The visitor's chosen location; cards show miles from it. */
  origin?: LatLng | null;
}

export const ShowCardGrid: React.FC<ShowCardGridProps> = ({
  shows,
  isSelected,
  onToggleSelect,
  origin = null,
}) => (
  <StaggeredGrid className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {shows.map(show => {
      const toggleProps = onToggleSelect ? { onToggleSelect: () => onToggleSelect(show) } : {};

      return (
        <ShowCardHorizontal
          key={show.id}
          show={show}
          userHasEntries={show.userHasEntries}
          isSelected={isSelected?.(show) ?? false}
          distanceMiles={showDistanceMiles(origin, show)}
          {...toggleProps}
        />
      );
    })}
  </StaggeredGrid>
);

export default ShowCardGrid;
