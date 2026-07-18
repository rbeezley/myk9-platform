/**
 * Entry Management's header/controls cluster: work-mode switch, display
 * density + saved views, and the search/filter/view-mode bar. Extracted from
 * `RegistrationView.tsx` (which owns selection-reset wiring around these
 * handlers) to keep that file under its size budget — this component stays a
 * thin, stateless wiring layer over the same controls it replaces inline.
 */
import { ListControls } from '@/components/common/ListControls';
import { EntryWorkModeSwitch } from './EntryWorkModeSwitch';
import { EntryManagementViewControls } from './EntryManagementViewControls';
import {
  ENTRY_MANAGEMENT_FILTERS,
  ENTRY_VIEW_MODES,
  type EntryAttentionFilter,
  type EntryManagementViewMode,
  type EntryWorkMode,
} from './entryManagementFilters';
import type {
  EntryDisplayPreset,
  EntryManagementOperationalView,
  EntryManagementPresetId,
  OperationalViewDensity,
} from '@/features/operational-views/operationalViews';

interface RegistrationViewControlsProps {
  workMode: EntryWorkMode;
  onWorkModeChange: (mode: EntryWorkMode) => void;
  activeExtraPresetId: EntryManagementPresetId | null;
  onSelectExtraPreset: (presetId: EntryManagementPresetId) => void;

  density: OperationalViewDensity;
  onDensityChange: (density: OperationalViewDensity) => void;
  displayPreset: EntryDisplayPreset;
  onDisplayPresetChange: (preset: EntryDisplayPreset) => void;
  userId: string | undefined;
  showId: string | undefined;
  trialFilter: string | null;
  classFilter: string | null;
  onApplyView: (view: EntryManagementOperationalView) => void;

  searchTerm: string;
  onSearchChange: (value: string) => void;
  attentionFilter: EntryAttentionFilter;
  paymentFilter: string;
  onAttentionFilterChange: (filter: EntryAttentionFilter) => void;
  onPaymentFilterChange: (value: string) => void;
  entryViewMode: EntryManagementViewMode;
  onEntryViewModeChange: (mode: EntryManagementViewMode) => void;
  resultsShowing: number;
  resultsTotal: number;
  filtered: boolean;
}

export function RegistrationViewControls({
  workMode,
  onWorkModeChange,
  activeExtraPresetId,
  onSelectExtraPreset,
  density,
  onDensityChange,
  displayPreset,
  onDisplayPresetChange,
  userId,
  showId,
  trialFilter,
  classFilter,
  onApplyView,
  searchTerm,
  onSearchChange,
  attentionFilter,
  paymentFilter,
  onAttentionFilterChange,
  onPaymentFilterChange,
  entryViewMode,
  onEntryViewModeChange,
  resultsShowing,
  resultsTotal,
  filtered,
}: RegistrationViewControlsProps) {
  return (
    <>
      <EntryWorkModeSwitch
        value={workMode}
        onChange={onWorkModeChange}
        activeExtraPresetId={activeExtraPresetId}
        onSelectExtraPreset={onSelectExtraPreset}
      />

      {/* Display density + personal saved views (tasks.md 3.2/3.3) */}
      <EntryManagementViewControls
        density={density}
        onDensityChange={onDensityChange}
        displayPreset={displayPreset}
        onDisplayPresetChange={onDisplayPresetChange}
        userId={userId}
        showId={showId}
        trialFilter={trialFilter}
        classFilter={classFilter}
        attentionFilter={attentionFilter}
        paymentFilter={paymentFilter}
        workMode={workMode}
        entryViewMode={entryViewMode}
        onApplyView={onApplyView}
      />

      {/* Search, filters, and view mode */}
      <ListControls
        search={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search entries..."
        filters={ENTRY_MANAGEMENT_FILTERS}
        filterValues={{
          attention: attentionFilter === 'all' ? '' : attentionFilter,
          payment: paymentFilter === 'all' ? '' : paymentFilter,
        }}
        onFilterChange={(key, value) => {
          if (key === 'attention') {
            onAttentionFilterChange((value || 'all') as EntryAttentionFilter);
          }
          if (key === 'payment') {
            onPaymentFilterChange(value || 'all');
          }
        }}
        viewMode={entryViewMode}
        onViewModeChange={mode => onEntryViewModeChange(mode as EntryManagementViewMode)}
        viewModes={ENTRY_VIEW_MODES}
        resultsShowing={resultsShowing}
        resultsTotal={resultsTotal}
        filtered={filtered}
        entityName="entries"
      />
    </>
  );
}
