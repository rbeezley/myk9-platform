/**
 * Trial Secretary Tools Page
 *
 * Shows two main tools:
 * 1. Kanban To-Do Board - Task management with drag-and-drop
 * 2. Steward Scheduler - Class-based volunteer assignment
 *
 * Access: All roles can view (read-only for non-admins)
 * - Admin: Full edit access (add, edit, delete, drag-and-drop)
 * - Judge/Steward/Exhibitor: View-only mode (see schedule assignments)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { HamburgerMenu, CompactOfflineIndicator, TabBar, FilterTriggerButton } from '../../components/ui';
import type { Tab } from '../../components/ui';
import { ClipboardList, Users, MoreVertical, Plus, Settings, Eye, Sliders, FileText } from 'lucide-react';
import { KanbanBoard } from './components/KanbanBoard';
import { ScheduleBoard } from './components/ScheduleBoard';
import { ResultsControlTab } from './components/ResultsControlTab';
import { CheckInStatusReport } from './components/CheckInStatusReport';
import './TrialSecretary.css';

type TabType = 'kanban' | 'schedule' | 'results' | 'reports';

export function TrialSecretary() {
  const { role, showContext } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  // Read-only mode for non-admin users
  const isReadOnly = role !== 'admin';

  // External triggers for ScheduleBoard actions
  const [scheduleTrigger, setScheduleTrigger] = useState<'add-volunteer' | 'manage-roles' | null>(null);

  // Search/filter state for volunteer schedule
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVolunteers, setSelectedVolunteers] = useState<string[]>([]);
  const [selectedJudges, setSelectedJudges] = useState<string[]>([]);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Check if any filters are active
  const hasActiveFilters = searchTerm.length > 0 || selectedVolunteers.length > 0 || selectedJudges.length > 0;

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedVolunteers([]);
    setSelectedJudges([]);
  }, []);

  // Tab configuration for TabBar component
  const tabs: Tab[] = useMemo(() => [
    { id: 'schedule', label: 'Volunteers', icon: <Users size={16} /> },
    { id: 'kanban', label: 'Tasks', icon: <ClipboardList size={16} /> },
    { id: 'reports', label: 'Reports', icon: <FileText size={16} /> },
    { id: 'results', label: 'Settings', icon: <Sliders size={16} /> },
  ], []);

  // Clear trigger after it's been consumed
  const clearScheduleTrigger = useCallback(() => {
    setScheduleTrigger(null);
  }, []);

  // Close actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.actions-menu-container')) {
        setShowActionsMenu(false);
      }
    };

    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActionsMenu]);

  return (
    <div className="secretary-page">
      {/* Header - Standard pattern */}
      <header className="page-header secretary-header">
        <HamburgerMenu currentPage="secretary" />
        <CompactOfflineIndicator />

        {/* Centered title */}
        <div className="secretary-title">
          <h1>Secretary Tools</h1>
          <span className="secretary-subtitle">{showContext?.showName}</span>
          {isReadOnly && (
            <span className="secretary-readonly-badge">
              <Eye size={12} />
              View Only
            </span>
          )}
        </div>

        {/* Header buttons - show on schedule tab */}
        {activeTab === 'schedule' && (
          <div className="header-buttons">
            {/* Filter/Search button - visible for all users */}
            <FilterTriggerButton
              onClick={() => setIsFilterPanelOpen(true)}
              hasActiveFilters={hasActiveFilters}
              activeFilterCount={selectedVolunteers.length + selectedJudges.length + (searchTerm ? 1 : 0)}
            />

            {/* Actions menu (three-dot) - only for admin users */}
            {!isReadOnly && (
              <div className="actions-menu-container">
                <button
                  className="icon-button actions-button"
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  aria-label="Actions menu"
                  title="More Actions"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {showActionsMenu && (
                  <div className="actions-dropdown-menu">
                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setScheduleTrigger('add-volunteer');
                      }}
                      className="action-menu-item"
                    >
                      <Plus className="h-4 w-4" />
                      Add Volunteer
                    </button>
                    <button
                      onClick={() => {
                        setShowActionsMenu(false);
                        setScheduleTrigger('manage-roles');
                      }}
                      className="action-menu-item"
                    >
                      <Settings className="h-4 w-4" />
                      Manage Roles
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Tab Navigation */}
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as TabType)}
      />

      {/* Tab Content */}
      <div className="secretary-content">
        {activeTab === 'kanban' && <KanbanBoard isReadOnly={isReadOnly} />}
        {activeTab === 'schedule' && (
          <ScheduleBoard
            isReadOnly={isReadOnly}
            externalTrigger={isReadOnly ? null : scheduleTrigger}
            onTriggerConsumed={clearScheduleTrigger}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            selectedVolunteers={selectedVolunteers}
            onSelectedVolunteersChange={setSelectedVolunteers}
            selectedJudges={selectedJudges}
            onSelectedJudgesChange={setSelectedJudges}
            onClearAllFilters={clearAllFilters}
            isFilterOpen={isFilterPanelOpen}
            onFilterClose={() => setIsFilterPanelOpen(false)}
          />
        )}
        {activeTab === 'reports' && showContext?.licenseKey && (
          <CheckInStatusReport licenseKey={showContext.licenseKey} />
        )}
        {activeTab === 'results' && showContext?.licenseKey && (
          <ResultsControlTab
            licenseKey={showContext.licenseKey}
            isReadOnly={isReadOnly}
          />
        )}
      </div>
    </div>
  );
}

export default TrialSecretary;
