import React from 'react';
import {
  HamburgerMenu,
  CompactOfflineIndicator,
  TrialDateBadge,
  RefreshIndicator,
  FilterTriggerButton,
} from '../../components/ui';
import { RefreshCw, List } from 'lucide-react';
import type { LongPressHandlers } from '@myk9/scoring-ui';
import type { TrialInfo } from './hooks/useClassListData';
import { useShowAccent } from '@/hooks/useShowAccent';

interface ClassListHeaderProps {
  trialInfo: TrialInfo;
  isRefreshing: boolean;
  isManualRefreshing: boolean;
  searchTerm: string;
  sortOrder: string;
  onNavigateHome: () => void;
  onOpenFilterPanel: () => void;
  onRefresh: () => void;
  refreshLongPressHandlers: LongPressHandlers;
  /** ID of the show for per-show accent honoring. */
  showId?: string;
}

export const ClassListHeader: React.FC<ClassListHeaderProps> = ({
  trialInfo,
  isRefreshing,
  isManualRefreshing,
  searchTerm,
  sortOrder,
  onNavigateHome,
  onOpenFilterPanel,
  onRefresh,
  refreshLongPressHandlers,
  showId,
}) => {
  const accentStyle = useShowAccent(showId);
  return (
    <header className="page-header class-list-header" style={accentStyle}>
      <HamburgerMenu
        currentPage="entries"
        backNavigation={{
          label: 'Back to Home',
          action: onNavigateHome,
        }}
      />
      <CompactOfflineIndicator />

      <div className="trial-info">
        <h1>
          <List className="title-icon" />
          {trialInfo.trial_name}
        </h1>
        <div className="trial-subtitle">
          <div className="trial-info-row">
            <div className="trial-details-group">
              <TrialDateBadge
                date={trialInfo.trial_date}
                trialNumber={trialInfo.trial_number}
                dateOnly={true}
              />
              <span className="trial-detail">Trial {trialInfo.trial_number}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="header-buttons">
        {(isRefreshing || isManualRefreshing) && (
          <RefreshIndicator isRefreshing={isRefreshing || isManualRefreshing} />
        )}

        <FilterTriggerButton
          onClick={onOpenFilterPanel}
          hasActiveFilters={searchTerm.length > 0 || sortOrder !== 'class_order'}
        />

        <button
          className="icon-button"
          onClick={onRefresh}
          disabled={isRefreshing || isManualRefreshing}
          aria-label="Refresh (long press for full reload)"
          title="Refresh (long press for full reload)"
          {...refreshLongPressHandlers}
        >
          <RefreshCw
            className={`h-5 w-5 ${isRefreshing || isManualRefreshing ? 'rotating' : ''}`}
          />
        </button>
      </div>
    </header>
  );
};
