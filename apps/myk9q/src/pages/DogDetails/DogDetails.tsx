import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { updateEntryCheckinStatus } from '../../services/entryService';
import { generateDogResultsSheet } from '../../services/reportService';
import { Button, HamburgerMenu, CompactOfflineIndicator, ArmbandBadge } from '../../components/ui';
import { CheckinStatusDialog, CheckinStatus } from '../../components/dialogs/CheckinStatusDialog';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useDogDetailsData, ClassEntry } from './hooks/useDogDetailsData';
import { DogStatistics } from './components/DogStatistics';
import { DogDetailsClassCard } from './components/DogDetailsClassCard';
import type { DogResultEntry } from '../../components/reports/DogResultsSheet';
import { logger } from '@/utils/logger';
import {
  ArrowLeft,
  RefreshCw,
  MoreVertical,
  FileText,
  CheckCircle,
  Loader2
} from 'lucide-react';
import './DogDetails.css';
import './components/DogStatistics.css';

export const DogDetails: React.FC = () => {
  const { armband } = useParams<{ armband: string }>();
  const navigate = useNavigate();
  const { showContext, role: _role } = useAuth();
  const { hasPermission: _hasPermission, isExhibitor: _isExhibitor, currentRole } = usePermission();
  const hapticFeedback = useHapticFeedback();

  // Use React Query for data fetching
  const {
    data,
    isLoading,
    error: _fetchError,
    refetch
  } = useDogDetailsData(armband, showContext?.licenseKey, currentRole);

  // Derive state from React Query data instead of syncing
  const dogInfo = data?.dogInfo ?? null;
  const classes = data?.classes ?? [];

  // Local state for UI management only
  const [isLoaded, setIsLoaded] = useState(false);
  const [activePopup, setActivePopup] = useState<number | null>(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  // Bulk check-in state
  const [isCheckingInAll, setIsCheckingInAll] = useState(false);
  const [checkInAllSuccess, setCheckInAllSuccess] = useState<string | null>(null);

  // Calculate pending entries (not checked in and not scored)
  const pendingEntries = useMemo(() => {
    return classes.filter(entry =>
      entry.check_in_status === 'no-status' && !entry.is_scored
    );
  }, [classes]);

  // Set loaded class after data loads to prevent CSS rehydration issues
  useEffect(() => {
    if (!isLoading && classes.length > 0) {
      // Small delay to ensure DOM is stable
      const timer = setTimeout(() => {
        setIsLoaded(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading, classes.length]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowHeaderMenu(false);
      }
    };

    if (showHeaderMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHeaderMenu]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.status-popup') && !target.closest('.status-button')) {
        setActivePopup(null);
      }
    };

    if (activePopup !== null) {
      // Use setTimeout to avoid immediate closure
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);

      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activePopup]);

  const handleStatusChange = async (classId: number, status: CheckinStatus) => {
    try {
      hapticFeedback.medium();

      // Exhibitors should only be able to use standard check-in statuses
      // 'in-ring' and 'completed' are filtered out by showRingManagement={false}
      if (status === 'in-ring' || status === 'completed') {
        logger.warn('Ring management statuses not available for exhibitors');
        return;
      }

      // Close popup
      setActivePopup(null);

      // Update database using the proper service function
      await updateEntryCheckinStatus(classId, status);

      // Refetch data to get updated state
      await refetch();
    } catch (error) {
      logger.error('Error:', error);
      // Reload to get correct state
      await refetch();
    }
  };

  const handleClassCardClick = (entry: ClassEntry) => {
    hapticFeedback.medium();

    // Navigate to the entry list for this class using class_id
    // Note: We don't need to check for combined Novice A/B classes here
    // since we're navigating from a specific dog's perspective
    navigate(`/class/${entry.class_id}/entries`);
  };

  const handleGenerateReport = () => {
    if (!dogInfo) return;

    // Convert ClassEntry[] to DogResultEntry[]
    const results: DogResultEntry[] = classes.map(classEntry => {
      // Build class name
      const classNameParts = [classEntry.element, classEntry.level];
      if (classEntry.section && classEntry.section !== '-') {
        classNameParts.push(classEntry.section);
      }

      return {
        id: classEntry.id,
        trialDate: classEntry.trial_date,
        trialNumber: classEntry.trial_number || 1,
        className: classNameParts.filter(Boolean).join(' '),
        element: classEntry.element || '',
        level: classEntry.level || '',
        section: classEntry.section,
        judgeName: classEntry.judge_name || 'TBD',
        searchTime: classEntry.search_time,
        faultCount: classEntry.fault_count,
        placement: classEntry.position || null,
        resultText: classEntry.result_text,
        isScored: classEntry.is_scored,
        checkInStatus: classEntry.check_in_status || 'no-status'
      };
    });

    const dogInfoForReport = {
      callName: dogInfo.call_name,
      breed: dogInfo.breed,
      handler: dogInfo.handler,
      armband: dogInfo.armband
    };

    generateDogResultsSheet(
      dogInfoForReport,
      results,
      showContext?.showName,
      undefined // organization - could be extracted from class data if needed
    );

    setShowHeaderMenu(false);
  };

  const handleCheckInAll = async () => {
    if (pendingEntries.length === 0 || isCheckingInAll) return;

    setIsCheckingInAll(true);
    setCheckInAllSuccess(null);
    hapticFeedback.medium();

    let successCount = 0;
    let failCount = 0;

    // Process all pending entries
    for (const entry of pendingEntries) {
      try {
        await updateEntryCheckinStatus(entry.id, 'checked-in');
        successCount++;
      } catch (error) {
        logger.error(`Failed to check in entry ${entry.id}:`, error);
        failCount++;
      }
    }

    setIsCheckingInAll(false);

    // Show success message
    if (failCount === 0) {
      setCheckInAllSuccess(`✓ Checked in to ${successCount} ${successCount === 1 ? 'class' : 'classes'}`);
    } else {
      setCheckInAllSuccess(`Checked in to ${successCount} of ${successCount + failCount} classes`);
    }

    // Clear success message after 3 seconds
    setTimeout(() => setCheckInAllSuccess(null), 3000);

    // Refetch to update the UI
    await refetch();
  };

  const handleOpenPopup = (event: React.MouseEvent<HTMLButtonElement>, classId: number) => {
    event.stopPropagation();
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();

    // Calculate position to show popup below the button
    // Adjust if too close to screen edges
    let left = rect.left;
    let top = rect.bottom + 8;

    // Check if popup would go off right edge
    if (left + 180 > window.innerWidth) {
      left = window.innerWidth - 190;
    }
    
    // Check if popup would go off bottom edge
    if (top + 250 > window.innerHeight) {
      // Show above button instead
      top = rect.top - 250;
    }

    setActivePopup(activePopup === classId ? null : classId);
  };


  if (isLoading) {
    return (
      <div className="dog-details-container">
        <div className="loading-container">
          <div className="loading-content">
            <RefreshCw className="loading-spinner" />
            <p className="loading-text">Loading dog details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!dogInfo) {
    return (
      <div className="dog-details-container">
        <div className="error-container">
          <div className="error-content">
            <p className="error-message">Dog not found</p>
            <Button onClick={() => navigate(-1)} variant="outline" className="error-button">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`dog-details-container ${isLoaded ? 'loaded' : ''}`}>
      
      {/* Header with outdoor-ready contrast */}
      <header className="page-header dog-header">
        <HamburgerMenu
          backNavigation={{
            label: "Back",
            action: () => navigate(-1)
          }}
        />
        <CompactOfflineIndicator />

        <h1>{dogInfo.call_name}</h1>

        <div className="header-actions">
          <div className="dropdown-container">
            <button
              className="header-menu-button"
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              aria-label="More options"
            >
              <MoreVertical size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            </button>

            {showHeaderMenu && (
              <div className="dropdown-menu">
                <button
                  className="dropdown-item"
                  onClick={handleGenerateReport}
                  disabled={!dogInfo || classes.length === 0}
                >
                  <FileText size={18} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                  <span>Performance Report</span>
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    refetch();
                    setShowHeaderMenu(false);
                  }}
                >
                  <RefreshCw size={18} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                  <span>Refresh</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Prominent Dog Info Card */}
      <div className="dog-info-card">
        <div className="dog-info-content">
          {/* Extra Prominent Armband for Outdoor Visibility */}
          <ArmbandBadge number={dogInfo.armband} />

          {/* Dog Information */}
          <div className="dog-details">
            <h2>{dogInfo.call_name}</h2>
            <p className="breed">{dogInfo.breed}</p>
            <p className="handler">Handler: {dogInfo.handler}</p>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area - only content below dog card scrolls */}
      <div className="dog-details-scrollable">
        <p className="results-notice">
          All Results are preliminary
        </p>

        {/* Class Entry Cards with Status Indicators */}
        <div className="classes-section">
        <div className="classes-header-row">
          <h3 className="classes-header">Class Entries</h3>
          <button
            className={`check-in-all-button ${pendingEntries.length === 0 ? 'disabled' : ''}`}
            onClick={handleCheckInAll}
            disabled={pendingEntries.length === 0 || isCheckingInAll}
            title={pendingEntries.length === 0 ? 'All classes already checked in' : `Check in to ${pendingEntries.length} classes`}
          >
            {isCheckingInAll ? (
              <>
                <Loader2 size={16} className="spinning" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <span>Checking In...</span>
              </>
            ) : (
              <>
                <CheckCircle size={16} style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <span>Check In All{pendingEntries.length > 0 ? ` (${pendingEntries.length})` : ''}</span>
              </>
            )}
          </button>
        </div>

        {/* Success Toast */}
        {checkInAllSuccess && (
          <div className="check-in-success-toast">
            <CheckCircle size={18} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
            <span>{checkInAllSuccess}</span>
          </div>
        )}

        <div className="classes-grid">
          {classes.map((entry) => (
            <DogDetailsClassCard
              key={entry.id}
              entry={entry}
              onCardClick={handleClassCardClick}
              onStatusClick={handleOpenPopup}
            />
          ))}
        </div>
        </div>

        {/* Dog Statistics Section */}
        <DogStatistics classes={classes} dogName={dogInfo.call_name} />
      </div>

      {/* Status Management Dialog */}
      <CheckinStatusDialog
        isOpen={activePopup !== null}
        onClose={() => {
          setActivePopup(null);
        }}
        onStatusChange={(status) => {
          if (activePopup !== null) {
            handleStatusChange(activePopup, status);
          }
        }}
        dogInfo={{
          armband: dogInfo?.armband || 0,
          callName: dogInfo?.call_name || '',
          handler: dogInfo?.handler || ''
        }}
        showDescriptions={true}
      />

    </div>
  );
};