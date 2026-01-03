import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { usePrefetch } from '@/hooks/usePrefetch';
import { ErrorState, TabBar, Tab, FilterPanel, SortOption } from '../../components/ui';
import { CheckinStatusDialog } from '../../components/dialogs/CheckinStatusDialog';
import { RunOrderDialog, RunOrderPreset } from '../../components/dialogs/RunOrderDialog';
import { Clock, CheckCircle, ArrowUpDown, Trophy, RefreshCw } from 'lucide-react';
import { Entry } from '../../stores/entryStore';
import { applyRunOrderPreset } from '../../services/runOrderService';
import { generateCheckInSheet, generateResultsSheet, generateScoresheetReport, ReportClassInfo, ScoresheetClassInfo } from '../../services/reportService';
import { supabase } from '../../lib/supabase';
import { getScoresheetRoute } from '../../services/scoresheetRouter';
import { preloadScoresheetByType } from '../../utils/scoresheetPreloader';
import { useEntryListData, useEntryListActions, useEntryListFilters, useDragAndDropEntries } from './hooks';
import {
  EntryListHeader,
  EntryListContent,
  ResetConfirmDialog,
  SelfCheckinDisabledDialog,
  SuccessToast,
  FloatingDoneButton,
  ResetMenuPopup,
} from './components';
import { logger } from '@/utils/logger';
import './EntryList.css';

/**
 * Parse organization data from org string
 */
function parseOrganizationData(orgString: string) {
  if (!orgString || orgString.trim() === '') {
    return { organization: 'AKC', activity_type: 'Scent Work' };
  }
  const parts = orgString.split(' ');
  return { organization: parts[0], activity_type: parts.slice(1).join(' ') };
}

export const CombinedEntryList: React.FC = () => {
  const { classIdA, classIdB } = useParams<{ classIdA: string; classIdB: string }>();
  const navigate = useNavigate();
  const { showContext } = useAuth();
  const { hasPermission } = usePermission();
  const { prefetch } = usePrefetch();

  // Drag state ref
  const isDraggingRef = useRef<boolean>(false);

  // Data management using shared hook
  const {
    entries,
    classInfo,
    isRefreshing,
    fetchError,
    refresh
  } = useEntryListData({
    classIdA,
    classIdB
  });

  // NOTE: React Query automatically fetches on mount when enabled: true
  // Removed manual refresh() call that was causing double-fetch and flash on load

  // Actions using shared hook
  const {
    handleStatusChange: handleStatusChangeHook,
    handleResetScore: handleResetScoreHook,
    handleMarkInRing,
    handleMarkCompleted,
    isSyncing,
    hasError
  } = useEntryListActions(refresh);

  // Local UI state
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [_manualOrder, setManualOrder] = useState<Entry[]>([]);
  const [sortOrder, setSortOrder] = useState<'run' | 'armband' | 'placement' | 'section-armband'>('section-armband');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeResetMenu, setActiveResetMenu] = useState<number | null>(null);
  const [resetMenuPosition, setResetMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [resetConfirmDialog, setResetConfirmDialog] = useState<{ show: boolean; entry: Entry | null }>({ show: false, entry: null });
  const [activeStatusPopup, setActiveStatusPopup] = useState<number | null>(null);
  const [runOrderDialogOpen, setRunOrderDialogOpen] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const [selfCheckinDisabledDialog, setSelfCheckinDisabledDialog] = useState(false);

  // Filters using shared hook
  const {
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    sectionFilter,
    setSectionFilter,
    filteredEntries,
    entryCounts
  } = useEntryListFilters({
    entries: localEntries,
    supportManualSort: false,
    supportSectionFilter: true
  });

  // NOTE: Cache update subscription is handled by useEntryListData hook.
  // Previously had a duplicate subscription here via manager.onCacheUpdate()
  // that caused double notifications. Removed to prevent issues.

  // Sync local entries with fetched data
  // Note: This pattern synchronizes React Query data with local state for optimistic UI updates
  useEffect(() => {
    if (entries.length > 0 && !isDraggingRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: syncing external data to local state
      setLocalEntries(entries);
    }
  }, [entries]);

  // Initial load animation
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Apply section filter and custom sorting
  const sectionFilteredEntries = sectionFilter === 'all'
    ? filteredEntries
    : filteredEntries.filter(e => e.section === sectionFilter);

  const sortedEntries = useMemo(() => {
    return [...sectionFilteredEntries].sort((a, b) => {
      // In-ring entries always first
      const aInRing = a.status === 'in-ring';
      const bInRing = b.status === 'in-ring';
      if (aInRing && !bInRing) return -1;
      if (!aInRing && bInRing) return 1;

      if (sortOrder === 'section-armband') {
        if (a.section && b.section && a.section !== b.section) {
          return a.section.localeCompare(b.section);
        }
        return a.armband - b.armband;
      } else if (sortOrder === 'armband') {
        return a.armband - b.armband;
      } else if (sortOrder === 'placement') {
        if (a.section && b.section && a.section !== b.section) {
          return a.section.localeCompare(b.section);
        }
        if (a.placement === undefined && b.placement === undefined) return 0;
        if (a.placement === undefined) return 1;
        if (b.placement === undefined) return -1;
        return a.placement - b.placement;
      } else if (sortOrder === 'run') {
        return (a.exhibitorOrder || 0) - (b.exhibitorOrder || 0);
      }
      return 0;
    });
  }, [sectionFilteredEntries, sortOrder]);

  const pendingEntries = sortedEntries.filter(e => !e.isScored);
  const completedEntries = sortedEntries.filter(e => e.isScored);
  const currentEntries = activeTab === 'pending' ? pendingEntries : completedEntries;

  // Drag and drop
  const {
    sensors,
    handleDragStart,
    handleDragEnd,
  } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    isDraggingRef,
    setManualOrder
  });

  // Scoresheet route helper
  const getScoreSheetRoute = useCallback((entry: Entry): string => {
    return getScoresheetRoute({
      org: showContext?.org || '',
      element: entry.element || '',
      level: entry.level || '',
      classId: entry.classId,
      entryId: entry.id,
      competition_type: showContext?.competition_type || 'Regular'
    });
  }, [showContext?.org, showContext?.competition_type]);

  // Prefetch handler
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- Using specific property access is intentional
  const handleEntryPrefetch = useCallback((entry: Entry) => {
    if (entry.isScored || !showContext?.org) return;

    const route = getScoreSheetRoute(entry);
    preloadScoresheetByType(showContext.org, entry.element || '');

    prefetch(
      `scoresheet-${entry.id}`,
      async () => ({ entryId: entry.id, route, entry }),
      { ttl: 30, priority: 3 }
    );

    const currentIndex = pendingEntries.findIndex(e => e.id === entry.id);
    if (currentIndex !== -1) {
      const nextEntries = pendingEntries.slice(currentIndex + 1, currentIndex + 3);
      nextEntries.forEach((nextEntry, offset) => {
        const nextRoute = getScoreSheetRoute(nextEntry);
        prefetch(
          `scoresheet-${nextEntry.id}`,
          async () => ({ entryId: nextEntry.id, route: nextRoute, entry: nextEntry }),
          { ttl: 30, priority: 2 - offset }
        );
      });
    }
  }, [showContext?.org, prefetch, pendingEntries, getScoreSheetRoute]);

  // Score click handler (combined view navigation)
  const handleScoreClick = useCallback((entry: Entry) => {
    if (entry.isScored) return;

    if (!hasPermission('canScore')) {
      alert('You do not have permission to score entries.');
      return;
    }

    const pairedClassId = entry.classId === parseInt(classIdA!)
      ? parseInt(classIdB!)
      : parseInt(classIdA!);

    const orgData = parseOrganizationData(showContext?.org || '');
    const element = entry.element || '';
    const navigationState = { pairedClassId };

    if (orgData.organization === 'AKC') {
      if (orgData.activity_type === 'Scent Work' || orgData.activity_type === 'ScentWork') {
        navigate(`/scoresheet/akc-scent-work/${entry.classId}/${entry.id}`, { state: navigationState });
      } else if (orgData.activity_type === 'FastCat' || orgData.activity_type === 'Fast Cat') {
        navigate(`/scoresheet/akc-fastcat/${entry.classId}/${entry.id}`, { state: navigationState });
      }
    } else if (orgData.organization === 'UKC') {
      if (orgData.activity_type === 'Nosework') {
        navigate(`/scoresheet/ukc-nosework/${entry.classId}/${entry.id}`, { state: navigationState });
      } else if (element === 'Obedience') {
        navigate(`/scoresheet/ukc-obedience/${entry.classId}/${entry.id}`, { state: navigationState });
      } else if (element === 'Rally') {
        navigate(`/scoresheet/ukc-rally/${entry.classId}/${entry.id}`, { state: navigationState });
      }
    }
  }, [hasPermission, classIdA, classIdB, showContext?.org, navigate]);

  // Status handlers
  const handleStatusClick = useCallback((e: React.MouseEvent, entryId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveStatusPopup(entryId);
  }, []);

  const handleStatusChange = useCallback(async (entryId: number, newStatus: 'no-status' | 'checked-in' | 'conflict' | 'pulled' | 'at-gate' | 'come-to-gate' | 'in-ring' | 'completed') => {
    setActiveStatusPopup(null);

    if (newStatus === 'in-ring') {
      // Get entry's current status before updating so it can be restored on cancel
      const currentEntry = localEntries.find(entry => entry.id === entryId);
      const currentStatus = currentEntry?.status;

      setLocalEntries(prev => prev.map(entry =>
        entry.id === entryId ? { ...entry, status: 'in-ring' } : entry
      ));
      try {
        // Pass current status so it can be restored if scoresheet is canceled
        await handleMarkInRing(entryId, currentStatus);
      } catch (error) {
        logger.error('Mark in-ring failed:', error);
        refresh();
      }
      return;
    }

    if (newStatus === 'completed') {
      setLocalEntries(prev => prev.map(entry =>
        entry.id === entryId ? { ...entry, isScored: true, status: 'completed' } : entry
      ));
      try {
        await handleMarkCompleted(entryId);
      } catch (error) {
        logger.error('Mark completed failed:', error);
        refresh();
      }
      return;
    }

    setLocalEntries(prev => prev.map(entry =>
      entry.id === entryId
        ? { ...entry, checkedIn: newStatus !== 'no-status', status: newStatus, _timestamp: Date.now() }
        : entry
    ));

    try {
      await handleStatusChangeHook(entryId, newStatus);
      await refresh();
    } catch (error) {
      logger.error('Status change failed:', error);
      setLocalEntries(prev => prev.map(entry =>
        entry.id === entryId
          ? { ...entry, status: entries.find(e => e.id === entryId)?.status || 'no-status' }
          : entry
      ));
      refresh();
    }
  }, [handleMarkInRing, handleMarkCompleted, handleStatusChangeHook, entries, localEntries, refresh]);

  // Reset menu handlers
  const handleResetMenuClick = useCallback((e: React.MouseEvent, entryId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Use rect.right so menu extends LEFT from button (via translateX(-100%) in ResetMenuPopup)
    setResetMenuPosition({ top: rect.bottom + 4, left: rect.right });
    setActiveResetMenu(entryId);
  }, []);

  const handleResetScore = useCallback((entry: Entry) => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
    setResetConfirmDialog({ show: true, entry });
  }, []);

  const confirmResetScore = useCallback(async () => {
    if (!resetConfirmDialog.entry) return;

    const entryId = resetConfirmDialog.entry.id;
    try {
      await handleResetScoreHook(entryId);
      await new Promise(resolve => setTimeout(resolve, 1500));
      await refresh();
      setActiveTab('pending');
    } catch (error) {
      logger.error('Failed to reset score:', error);
      alert(`Failed to reset score: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setResetConfirmDialog({ show: false, entry: null });
  }, [resetConfirmDialog.entry, handleResetScoreHook, refresh, setActiveTab]);

  const cancelResetScore = useCallback(() => {
    setResetConfirmDialog({ show: false, entry: null });
  }, []);

  const closeResetMenu = useCallback(() => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
  }, []);

  // Run order handlers
  const handleApplyRunOrder = useCallback(async (preset: RunOrderPreset) => {
    try {
      const reorderedEntries = await applyRunOrderPreset(localEntries, preset);
      setLocalEntries(reorderedEntries);
      setRunOrderDialogOpen(false);
      setShowSuccessMessage(true);
      setSortOrder('run');
      setTimeout(() => setShowSuccessMessage(false), 2000);
      await refresh();
    } catch (error) {
      logger.error('❌ Error applying run order:', error);
      setRunOrderDialogOpen(false);
    }
  }, [localEntries, refresh]);

  const handleOpenDragMode = useCallback(() => {
    setRunOrderDialogOpen(false);
    setManualOrder([...currentEntries]);
    setIsDragMode(true);
    setSortOrder('run');
  }, [currentEntries]);

  // Print handlers
  const handlePrintCheckIn = useCallback(() => {
    if (!classInfo) return;

    const orgData = parseOrganizationData(showContext?.org || '');
    const reportClassInfo: ReportClassInfo = {
      className: `${classInfo.element} ${classInfo.level} A & B Combined`,
      element: classInfo.element,
      level: classInfo.level,
      section: 'A & B',
      trialDate: classInfo.trialDate || '',
      trialNumber: classInfo.trialNumber || '',
      judgeName: classInfo.judgeName || 'TBD',
      organization: orgData.organization,
      activityType: orgData.activity_type
    };

    generateCheckInSheet(reportClassInfo, entries);
  }, [classInfo, showContext?.org, entries]);

  const handlePrintResultsSectionA = useCallback(() => {
    if (!classInfo) return;

    const sectionAEntries = entries.filter(entry => entry.section === 'A');
    const orgData = parseOrganizationData(showContext?.org || '');
    const reportClassInfo: ReportClassInfo = {
      className: `${classInfo.element} ${classInfo.level} Section A`,
      element: classInfo.element,
      level: classInfo.level,
      section: 'A',
      trialDate: classInfo.trialDate || '',
      trialNumber: classInfo.trialNumber || '',
      judgeName: classInfo.judgeName || 'TBD',
      organization: orgData.organization,
      activityType: orgData.activity_type
    };

    generateResultsSheet(reportClassInfo, sectionAEntries);
  }, [classInfo, showContext?.org, entries]);

  const handlePrintResultsSectionB = useCallback(() => {
    if (!classInfo) return;

    const sectionBEntries = entries.filter(entry => entry.section === 'B');
    const orgData = parseOrganizationData(showContext?.org || '');
    const reportClassInfo: ReportClassInfo = {
      className: `${classInfo.element} ${classInfo.level} Section B`,
      element: classInfo.element,
      level: classInfo.level,
      section: 'B',
      trialDate: classInfo.trialDate || '',
      trialNumber: classInfo.trialNumber || '',
      judgeName: classInfo.judgeNameB || classInfo.judgeName || 'TBD',
      organization: orgData.organization,
      activityType: orgData.activity_type
    };

    generateResultsSheet(reportClassInfo, sectionBEntries);
  }, [classInfo, showContext?.org, entries]);

  // Parse time limits from string format
  const parseTimeLimit = (timeStr?: string): number | undefined => {
    if (!timeStr) return undefined;
    const num = parseInt(timeStr, 10);
    if (!isNaN(num)) return num;
    return undefined;
  };

  // Helper to fetch class requirements
  const fetchClassRequirements = async (orgData: { organization: string }, element?: string, level?: string) => {
    // Skip for Master level - judge determines hides count
    const isMasterLevel = level?.toLowerCase().includes('master');
    if (isMasterLevel || !orgData.organization || !element || !level) {
      return { hidesText: undefined, distractionsText: undefined };
    }

    try {
      const { data: requirements } = await supabase
        .from('class_requirements')
        .select('hides, distractions')
        .eq('organization', orgData.organization)
        .eq('element', element)
        .eq('level', level)
        .single();

      if (requirements) {
        return { hidesText: requirements.hides, distractionsText: requirements.distractions };
      }
    } catch (reqError) {
      logger.warn('Could not fetch class requirements:', reqError);
    }
    return { hidesText: undefined, distractionsText: undefined };
  };

  const handlePrintScoresheetSectionA = useCallback(async () => {
    if (!classInfo) return;

    const sectionAEntries = entries.filter(entry => entry.section === 'A');
    const orgData = parseOrganizationData(showContext?.org || '');
    const { hidesText, distractionsText } = await fetchClassRequirements(orgData, classInfo.element, classInfo.level);

    const scoresheetClassInfo: ScoresheetClassInfo = {
      className: `${classInfo.element} ${classInfo.level} Section A`,
      element: classInfo.element,
      level: classInfo.level,
      section: 'A',
      trialDate: classInfo.trialDate || '',
      trialNumber: classInfo.trialNumber || '',
      judgeName: classInfo.judgeName || 'TBD',
      organization: orgData.organization,
      activityType: orgData.activity_type,
      timeLimitSeconds: parseTimeLimit(classInfo.timeLimit),
      timeLimitArea2Seconds: parseTimeLimit(classInfo.timeLimit2),
      timeLimitArea3Seconds: parseTimeLimit(classInfo.timeLimit3),
      areaCount: classInfo.areas,
      hidesText,
      distractionsText
    };

    generateScoresheetReport(scoresheetClassInfo, sectionAEntries);
  }, [classInfo, showContext?.org, entries]);

  const handlePrintScoresheetSectionB = useCallback(async () => {
    if (!classInfo) return;

    const sectionBEntries = entries.filter(entry => entry.section === 'B');
    const orgData = parseOrganizationData(showContext?.org || '');
    const { hidesText, distractionsText } = await fetchClassRequirements(orgData, classInfo.element, classInfo.level);

    const scoresheetClassInfo: ScoresheetClassInfo = {
      className: `${classInfo.element} ${classInfo.level} Section B`,
      element: classInfo.element,
      level: classInfo.level,
      section: 'B',
      trialDate: classInfo.trialDate || '',
      trialNumber: classInfo.trialNumber || '',
      judgeName: classInfo.judgeNameB || classInfo.judgeName || 'TBD',
      organization: orgData.organization,
      activityType: orgData.activity_type,
      timeLimitSeconds: parseTimeLimit(classInfo.timeLimit),
      timeLimitArea2Seconds: parseTimeLimit(classInfo.timeLimit2),
      timeLimitArea3Seconds: parseTimeLimit(classInfo.timeLimit3),
      areaCount: classInfo.areas,
      hidesText,
      distractionsText
    };

    generateScoresheetReport(scoresheetClassInfo, sectionBEntries);
  }, [classInfo, showContext?.org, entries]);

  // Tab configuration
  const sectionTabs: Tab[] = useMemo(() => [
    { id: 'all', label: 'All Sections', count: entries.length },
    { id: 'A', label: 'Section A', count: entries.filter(e => e.section === 'A').length },
    { id: 'B', label: 'Section B', count: entries.filter(e => e.section === 'B').length }
  ], [entries]);

  const statusTabs: Tab[] = useMemo(() => [
    { id: 'pending', label: 'Pending', icon: <Clock size={16} />, count: entryCounts.pending },
    { id: 'completed', label: 'Completed', icon: <CheckCircle size={16} />, count: entryCounts.completed }
  ], [entryCounts]);

  const sortOptions: SortOption[] = useMemo(() => {
    const options: SortOption[] = [
      { value: 'section-armband', label: 'Section & Armband', icon: <ArrowUpDown size={16} /> },
      { value: 'run', label: 'Run Order', icon: <ArrowUpDown size={16} /> },
      { value: 'armband', label: 'Armband', icon: <ArrowUpDown size={16} /> }
    ];
    if (activeTab === 'completed') {
      options.push({ value: 'placement', label: 'Placement', icon: <Trophy size={16} /> });
    }
    return options;
  }, [activeTab]);

  const hasActiveFilters = searchTerm.length > 0 || sortOrder !== 'section-armband';

  // Loading state
  if (!entries.length && !fetchError) {
    return (
      <div className="entry-list-container">
        <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
          <div className="text-center">
            <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading combined entries...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="entry-list-container">
        <ErrorState
          message={`Failed to load entries: ${fetchError.message || 'Please check your connection and try again.'}`}
          onRetry={refresh}
          isRetrying={isRefreshing}
        />
      </div>
    );
  }

  return (
    <div className={`entry-list-container${isLoaded ? ' loaded' : ''}`} data-loaded={isLoaded}>
      <EntryListHeader
        classInfo={classInfo}
        isRefreshing={isRefreshing}
        isSyncing={isSyncing}
        hasError={hasError}
        hasActiveFilters={hasActiveFilters}
        onFilterClick={() => setIsFilterPanelOpen(true)}
        onRefresh={() => refresh(true)}
        showSectionsBadge={true}
        actionsMenu={{
          printOptions: [
            { label: 'Check-In Sheet (A & B)', onClick: handlePrintCheckIn, icon: 'checkin' },
            { label: 'Results - Section A', onClick: handlePrintResultsSectionA, icon: 'results', disabled: completedEntries.filter(e => e.section === 'A').length === 0 },
            { label: 'Results - Section B', onClick: handlePrintResultsSectionB, icon: 'results', disabled: completedEntries.filter(e => e.section === 'B').length === 0 },
            { label: 'Scoresheet - Section A', onClick: handlePrintScoresheetSectionA, icon: 'scoresheet' },
            { label: 'Scoresheet - Section B', onClick: handlePrintScoresheetSectionB, icon: 'scoresheet' },
          ],
        }}
      />

      {/* Section Filter Tabs */}
      <TabBar
        tabs={sectionTabs}
        activeTab={sectionFilter}
        onTabChange={(tabId) => setSectionFilter(tabId as 'all' | 'A' | 'B')}
        className="full-width"
      />

      {/* Status Tabs */}
      <TabBar
        tabs={statusTabs}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as 'pending' | 'completed')}
      />

      <div className="entry-list-scrollable">
        <div className="entry-list-content">
          <EntryListContent
            entries={currentEntries}
            activeTab={activeTab}
            isDragMode={isDragMode}
            showContext={showContext}
            classInfo={classInfo}
            hasPermission={hasPermission}
            onEntryClick={handleScoreClick}
            onStatusClick={handleStatusClick}
            onResetMenuClick={handleResetMenuClick}
            onSelfCheckinDisabled={() => setSelfCheckinDisabledDialog(true)}
            onPrefetch={handleEntryPrefetch}
            showSectionBadges={true}
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onOpenDragMode={handleOpenDragMode}
          />
        </div>
      </div>

      <FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search dog, handler, breed, armband..."
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        onSortChange={(order) => {
          setSortOrder(order as 'run' | 'armband' | 'placement' | 'section-armband');
          setIsDragMode(false);
        }}
        resultsLabel={searchTerm ? `${filteredEntries.length} of ${localEntries.length} entries` : `${currentEntries.length} entries`}
      />

      <CheckinStatusDialog
        isOpen={activeStatusPopup !== null}
        onClose={() => setActiveStatusPopup(null)}
        onStatusChange={(status) => {
          if (activeStatusPopup !== null) {
            handleStatusChange(activeStatusPopup, status);
          }
        }}
        dogInfo={{
          armband: localEntries.find(e => e.id === activeStatusPopup)?.armband || 0,
          callName: localEntries.find(e => e.id === activeStatusPopup)?.callName || '',
          handler: localEntries.find(e => e.id === activeStatusPopup)?.handler || ''
        }}
        showDescriptions={true}
        showRingManagement={hasPermission('canScore')}
      />

      <RunOrderDialog
        isOpen={runOrderDialogOpen}
        onClose={() => setRunOrderDialogOpen(false)}
        entries={localEntries}
        onApplyOrder={handleApplyRunOrder}
        onOpenDragMode={handleOpenDragMode}
      />

      <ResetMenuPopup
        activeEntryId={activeResetMenu}
        position={resetMenuPosition}
        entries={localEntries}
        onResetScore={handleResetScore}
        onClose={closeResetMenu}
      />

      <ResetConfirmDialog
        isOpen={resetConfirmDialog.show}
        entry={resetConfirmDialog.entry}
        onConfirm={confirmResetScore}
        onCancel={cancelResetScore}
      />

      <SelfCheckinDisabledDialog
        isOpen={selfCheckinDisabledDialog}
        onClose={() => setSelfCheckinDisabledDialog(false)}
      />

      <SuccessToast
        isVisible={showSuccessMessage}
        message="Run order updated successfully"
      />

      <FloatingDoneButton
        isVisible={isDragMode}
        onClick={() => {
          setIsDragMode(false);
          setSortOrder('run');
        }}
      />
    </div>
  );
};

export default CombinedEntryList;
