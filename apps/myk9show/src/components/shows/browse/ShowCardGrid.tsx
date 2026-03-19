import React from 'react';
import { ShowCardHorizontal } from './ShowCardHorizontal';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { UserWithRoles } from '@/types/auth-types';

interface ShowCardGridProps {
  shows: EnhancedShow[];
  entries: SyncableShowEntry[];
  selectedTab: string;
  user: UserWithRoles | null;
  isSelected?: (item: EnhancedShow) => boolean;
  onToggleSelect?: (item: EnhancedShow) => void;
}

export const ShowCardGrid: React.FC<ShowCardGridProps> = ({
  shows,
  entries,
  selectedTab,
  user,
  isSelected,
  onToggleSelect,
}) => (
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
    {shows.map(show => {
      const toggleProps = onToggleSelect ? { onToggleSelect: () => onToggleSelect(show) } : {};

      return (
        <ShowCardHorizontal
          key={show.id}
          show={show}
          entries={entries}
          selectedTab={selectedTab}
          user={user}
          isSelected={isSelected?.(show) ?? false}
          {...toggleProps}
        />
      );
    })}
  </div>
);

export default ShowCardGrid;
