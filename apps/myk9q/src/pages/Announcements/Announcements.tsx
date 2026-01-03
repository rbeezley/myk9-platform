import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { useAnnouncementStore } from '../../stores/announcementStore';
import type { Announcement } from '../../stores/announcementStore';
import { HamburgerMenu, CompactOfflineIndicator, PullToRefresh } from '../../components/ui';
import { useLongPress } from '@/hooks/useLongPress';
import { AnnouncementCard } from '../../components/announcements/AnnouncementCard';
import { CreateAnnouncementModal } from '../../components/announcements/CreateAnnouncementModal';
import { DeleteConfirmationModal } from '../../components/announcements/DeleteConfirmationModal';
import { FilterPanel } from '../../components/ui/FilterPanel';
import { logger } from '@/utils/logger';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import {
  Plus,
  Bell,
  RefreshCw,
  Filter,
  CheckCircle,
  AlertTriangle,
  Info,
  Settings,
  MoreVertical,
  ArrowDown,
  ArrowUp,
  AlertCircle,
  Mail,
  Search
} from 'lucide-react';
import './Announcements.css';
import '../../components/announcements/AnnouncementComponents.css';

export const Announcements: React.FC = () => {
  const navigate = useNavigate();
  const { showContext, role } = useAuth();
  const { hasRole } = usePermission();
  const {
    announcements,
    unreadCount,
    isLoading,
    error,
    currentLicenseKey,
    filters,
    setLicenseKey,
    fetchAnnouncements,
    markAllAsRead,
    updateLastVisit,
    setFilters,
    clearFilters,
    getFilteredAnnouncements,
    enableRealtime: _enableRealtime,
    deleteAnnouncement
  } = useAnnouncementStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<string>('newest');

  // Sort options for FilterPanel
  const sortOptions = [
    { value: 'newest', label: 'Newest', icon: <ArrowDown size={16} /> },
    { value: 'oldest', label: 'Oldest', icon: <ArrowUp size={16} /> },
    { value: 'priority', label: 'Priority', icon: <AlertCircle size={16} /> },
    { value: 'unread', label: 'Unread', icon: <Mail size={16} /> },
  ];
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; announcement: Announcement | null }>({ isOpen: false, announcement: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenuDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenuDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenuDropdown]);

  // Can create announcements if admin, judge, or steward
  const canCreateAnnouncements = hasRole(['admin', 'judge', 'steward']);

  // Initialize with current show context
  useEffect(() => {
    if (showContext?.licenseKey && currentLicenseKey !== showContext.licenseKey) {
      setLicenseKey(showContext.licenseKey, showContext.showName);
    }
  }, [showContext, currentLicenseKey, setLicenseKey]);

  // Update last visit when component mounts
  useEffect(() => {
    updateLastVisit();
  }, [updateLastVisit]);

  // Handle search term changes
  useEffect(() => {
    setFilters({ searchTerm });
  }, [searchTerm, setFilters]);

  // Manual refresh - syncs from server first to get fresh data
  const handleRefresh = useCallback(async () => {
    if (!currentLicenseKey) return;

    setIsRefreshing(true);
    // Minimum feedback duration so users see something happened
    const minFeedbackDelay = new Promise(resolve => setTimeout(resolve, 500));
    try {
      // Sync announcements from server first
      try {
        logger.log('🔄 Force sync requested - syncing announcements from server...');
        const manager = await ensureReplicationManager();
        await manager.syncTable('announcements', { licenseKey: currentLicenseKey });
        logger.log('✅ Force sync complete');
      } catch (syncError) {
        // Sync failed (likely offline) - continue with cached data
        logger.warn('⚠️ Sync failed (offline?), using cached data:', syncError);
      }

      await Promise.all([fetchAnnouncements(currentLicenseKey), minFeedbackDelay]);
    } catch (error) {
      logger.error('Failed to refresh announcements:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentLicenseKey, fetchAnnouncements]);

  // Hard refresh (full page reload) - triggered by long press on refresh button
  const handleHardRefresh = useCallback(() => {
    logger.log('[Announcements] Hard refresh triggered via long press');
    window.location.reload();
  }, []);

  // Long press handler for refresh button
  const refreshLongPressHandlers = useLongPress(handleHardRefresh, {
    delay: 800,
    enabled: !isRefreshing,
  });

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      logger.error('Failed to mark all as read:', error);
    }
  };

  // Get filtered announcements and apply sorting
  // IMPORTANT: Include `announcements` in deps - getFilteredAnnouncements is a stable
  // function reference that doesn't change when data changes, so we need the data itself
  // as a dependency to trigger recalculation
  const filteredAnnouncements = React.useMemo(() => {
    const filtered = getFilteredAnnouncements();

    // Priority order for sorting (urgent first, then high, then normal)
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2 };

    return [...filtered].sort((a, b) => {
      switch (sortOrder) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'priority':
          return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
        case 'unread':
          // Unread first, then by date
          if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [announcements, getFilteredAnnouncements, sortOrder]);

  return (
    <div className="announcements-container">
      {/* Header with Hamburger Menu, Title, and Actions */}
      <header className="page-header announcements-header">
        <div className="header-left">
          <HamburgerMenu currentPage="announcements" />
          <CompactOfflineIndicator />
        </div>

        <div className="header-center">
          <h1>
            <Bell className="header-icon" />
            Announcements
            {unreadCount > 0 && (
              <span className="unread-badge">{unreadCount}</span>
            )}
          </h1>
        </div>

        <div className="header-actions">
          {/* 3-Dot Menu */}
          <div ref={menuRef} className="menu-container" style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMenuDropdown(!showMenuDropdown)}
              className="action-btn menu-btn"
              title="More options"
              aria-label="More options"
            >
              <MoreVertical />
            </button>

            {/* Dropdown Menu */}
            {showMenuDropdown && (
              <div className="dropdown-menu announcements-menu">
                {/* Refresh - Primary action, always first (long press for full reload) */}
                <button
                  onClick={() => {
                    handleRefresh();
                    setShowMenuDropdown(false);
                  }}
                  disabled={isRefreshing}
                  className="dropdown-item"
                  title="Refresh (long press for full reload)"
                  {...refreshLongPressHandlers}
                >
                  <RefreshCw size={18} className={isRefreshing ? 'spinning' : ''} />
                  <span>Refresh</span>
                </button>

                {/* Divider */}
                <div className="dropdown-divider" />

                {/* Search & Sort */}
                <button
                  onClick={() => {
                    setShowFilterPanel(true);
                    setShowMenuDropdown(false);
                  }}
                  className="dropdown-item"
                >
                  <Filter size={18} />
                  <span>Search & Sort</span>
                </button>

                {/* Mark All Read */}
                {unreadCount > 0 && (
                  <button
                    onClick={() => {
                      handleMarkAllAsRead();
                      setShowMenuDropdown(false);
                    }}
                    className="dropdown-item"
                  >
                    <CheckCircle size={18} />
                    <span>Mark All as Read</span>
                  </button>
                )}

                {/* Create Announcement - Role-specific action */}
                {canCreateAnnouncements && (
                  <button
                    onClick={() => {
                      setShowCreateModal(true);
                      setShowMenuDropdown(false);
                    }}
                    className="dropdown-item"
                  >
                    <Plus size={18} />
                    <span>Create Announcement</span>
                  </button>
                )}

                {/* Notification Settings */}
                <button
                  onClick={() => {
                    navigate('/settings');
                    setShowMenuDropdown(false);
                  }}
                  className="dropdown-item"
                >
                  <Settings size={18} />
                  <span>Notification Settings</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Filter Panel */}
      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search announcements..."
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        resultsLabel={`${filteredAnnouncements.length} of ${announcements.length} announcements`}
        title="Search & Sort"
      />

      {/* Content with Pull to Refresh */}
      <PullToRefresh
        onRefresh={handleRefresh}
        enabled
        threshold={80}
      >
      <div className="announcements-content">
        {error && (
          <div className="error-banner">
            <AlertTriangle />
            <span>Failed to load announcements: {error}</span>
            <button onClick={handleRefresh} className="retry-btn">
              Retry
            </button>
          </div>
        )}

        {isLoading && announcements.length === 0 ? (
          <div className="loading-state">
            <RefreshCw className="spinning" />
            <span>Loading announcements...</span>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="empty-state">
            {searchTerm || Object.keys(filters).length > 1 ? (
              <>
                <Search className="empty-icon" />
                <h3>No announcements found</h3>
                <p>Try adjusting your search or filters</p>
                <button onClick={() => {
                  setSearchTerm('');
                  clearFilters();
                }} className="clear-filters-btn">
                  Clear all filters
                </button>
              </>
            ) : (
              <>
                <Bell className="empty-icon" />
                <h3>No announcements yet</h3>
                <p>Check back later for updates from event staff</p>
                {canCreateAnnouncements && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="create-first-btn"
                  >
                    <Plus />
                    Create first announcement
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="announcements-list">
            {filteredAnnouncements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                currentUserRole={role || undefined}
                onEdit={() => {
                  setEditingAnnouncement(announcement);
                  setShowCreateModal(true);
                }}
                onDelete={() => {
                  setDeleteConfirmation({ isOpen: true, announcement });
                }}
              />
            ))}
          </div>
        )}
      </div>
      </PullToRefresh>

      {/* Active Filters Summary */}
      {(searchTerm || Object.keys(filters).some(key => key !== 'searchTerm' && filters[key as keyof typeof filters])) && (
        <div className="active-filters-summary">
          <Info className="info-icon" />
          <span>
            Showing {filteredAnnouncements.length} of {announcements.length} announcements
          </span>
          <button onClick={() => {
            setSearchTerm('');
            clearFilters();
          }} className="clear-all-btn">
            Clear all
          </button>
        </div>
      )}

      {/* Create/Edit Announcement Modal */}
      {showCreateModal && (
        <CreateAnnouncementModal
          licenseKey={currentLicenseKey || ''}
          userRole={role || undefined}
          editingAnnouncement={editingAnnouncement || undefined}
          onClose={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
            handleRefresh();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        announcement={deleteConfirmation.announcement}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (!deleteConfirmation.announcement) return;

          setIsDeleting(true);
          try {
            await deleteAnnouncement(deleteConfirmation.announcement.id);
            setDeleteConfirmation({ isOpen: false, announcement: null });
          } catch (error) {
            logger.error('Failed to delete announcement:', error);
            alert('Failed to delete announcement. Please try again.');
          } finally {
            setIsDeleting(false);
          }
        }}
        onCancel={() => {
          if (!isDeleting) {
            setDeleteConfirmation({ isOpen: false, announcement: null });
          }
        }}
      />
    </div>
  );
};