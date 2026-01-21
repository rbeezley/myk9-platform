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
import { cn } from '@/lib/utils';
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
import '../../components/announcements/AnnouncementComponents.css';

/** Tailwind styles for Announcements page */
const styles = {
  container: cn(
    "min-h-screen px-3 pb-8 sm:px-6",
    "bg-[var(--secondary)] dark:bg-[var(--background)]"
  ),
  header: "page-header justify-between relative",
  headerLeft: "flex items-center gap-2 flex-shrink-0",
  headerCenter: cn(
    "absolute left-1/2 -translate-x-1/2",
    "flex flex-col items-center justify-center gap-1"
  ),
  headerTitle: cn(
    "m-0 text-lg font-semibold tracking-tight leading-none",
    "text-[var(--foreground)] inline-flex items-center gap-2"
  ),
  headerIcon: "w-5 h-5 text-[var(--primary)]",
  unreadBadge: cn(
    "bg-[var(--danger)] text-white rounded-full",
    "px-2 py-1 text-xs font-semibold min-w-6 text-center leading-none"
  ),
  headerActions: "flex items-center gap-2",
  actionBtn: cn(
    "flex items-center justify-center w-10 h-10",
    "border-none rounded-lg",
    "bg-[var(--muted)] text-[var(--token-text-secondary)]",
    "cursor-pointer transition-all duration-200",
    "hover:text-[var(--primary)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "[&_svg]:w-5 [&_svg]:h-5"
  ),
  actionBtnActive: "bg-[var(--primary)] text-white [&_svg]:text-white",
  actionBtnPrimary: "bg-[var(--primary)] text-white hover:brightness-90",
  menuContainer: "relative",
  dropdown: cn(
    "absolute top-[calc(100%+0.5rem)] right-0",
    "bg-[var(--card)] border border-[var(--border)]",
    "rounded-lg shadow-lg z-[1000] overflow-hidden min-w-[200px]"
  ),
  dropdownItem: cn(
    "flex items-center gap-4 w-full px-4 py-3",
    "bg-transparent border-none text-left cursor-pointer",
    "text-[var(--foreground)] text-base font-medium",
    "transition-colors duration-200",
    "hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed",
    "[&_svg]:shrink-0 [&_svg]:text-current"
  ),
  dropdownItemActive: "bg-[var(--primary)] text-white",
  dropdownDivider: "h-px my-1 bg-[var(--border)]",
  content: "p-4 lg:px-6",
  errorBanner: cn(
    "flex items-center gap-4 p-4",
    "bg-[var(--danger-subtle)] text-[var(--danger)]",
    "rounded-lg mb-4",
    "[&_svg]:w-5 [&_svg]:h-5 [&_svg]:shrink-0"
  ),
  retryBtn: cn(
    "ml-auto px-4 py-2",
    "border border-[var(--danger)] rounded-md",
    "bg-transparent text-[var(--danger)] text-sm",
    "cursor-pointer transition-all duration-200",
    "hover:bg-[var(--danger)] hover:text-white"
  ),
  loadingState: cn(
    "flex flex-col items-center justify-center",
    "py-12 px-4 gap-4 text-[var(--token-text-secondary)]",
    "[&_svg]:w-8 [&_svg]:h-8"
  ),
  emptyState: cn(
    "flex flex-col items-center justify-center",
    "py-12 px-4 gap-4 text-center text-[var(--token-text-secondary)]"
  ),
  emptyIcon: "w-12 h-12 text-[var(--text-tertiary)]",
  emptyTitle: "text-xl font-semibold m-0 text-[var(--foreground)]",
  emptyText: "text-sm m-0 max-w-xs",
  clearFiltersBtn: cn(
    "flex items-center gap-2 px-6 py-3",
    "border border-[var(--primary)] rounded-lg",
    "bg-transparent text-[var(--primary)] text-sm font-medium",
    "cursor-pointer transition-all duration-200 mt-2",
    "hover:bg-[var(--primary)] hover:text-white"
  ),
  list: "flex flex-col gap-4",
  activeFiltersSummary: cn(
    "fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2",
    "flex items-center gap-4 px-4 py-3",
    "bg-[var(--surface)] border border-[var(--border)]",
    "rounded-2xl sm:rounded-full shadow-lg",
    "text-sm text-[var(--token-text-secondary)]",
    "backdrop-blur-sm z-50"
  ),
  infoIcon: "w-4 h-4 text-[var(--primary)]",
  clearAllBtn: cn(
    "px-3 py-1 border border-[var(--primary)] rounded-full",
    "bg-transparent text-[var(--primary)] text-xs font-medium",
    "cursor-pointer transition-all duration-200",
    "hover:bg-[var(--primary)] hover:text-white"
  ),
  createFirstBtn: cn(
    "flex items-center gap-2 px-6 py-3",
    "border-none rounded-lg",
    "bg-[var(--primary)] text-white text-sm font-medium",
    "cursor-pointer transition-all duration-200 mt-2",
    "hover:brightness-90",
    "[&_svg]:w-5 [&_svg]:h-5"
  ),
  spinning: "animate-spin",
};

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
    <div className={styles.container}>
      {/* Header with Hamburger Menu, Title, and Actions */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <HamburgerMenu currentPage="announcements" />
          <CompactOfflineIndicator />
        </div>

        <div className={styles.headerCenter}>
          <h1 className={styles.headerTitle}>
            <Bell className={styles.headerIcon} />
            Announcements
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount}</span>
            )}
          </h1>
        </div>

        <div className={styles.headerActions}>
          {/* 3-Dot Menu */}
          <div ref={menuRef} className={styles.menuContainer}>
            <button
              onClick={() => setShowMenuDropdown(!showMenuDropdown)}
              className={styles.actionBtn}
              title="More options"
              aria-label="More options"
            >
              <MoreVertical />
            </button>

            {/* Dropdown Menu */}
            {showMenuDropdown && (
              <div className={styles.dropdown}>
                {/* Refresh - Primary action, always first (long press for full reload) */}
                <button
                  onClick={() => {
                    handleRefresh();
                    setShowMenuDropdown(false);
                  }}
                  disabled={isRefreshing}
                  className={styles.dropdownItem}
                  title="Refresh (long press for full reload)"
                  {...refreshLongPressHandlers}
                >
                  <RefreshCw size={18} className={isRefreshing ? styles.spinning : ''} />
                  <span>Refresh</span>
                </button>

                {/* Divider */}
                <div className={styles.dropdownDivider} />

                {/* Search & Sort */}
                <button
                  onClick={() => {
                    setShowFilterPanel(true);
                    setShowMenuDropdown(false);
                  }}
                  className={styles.dropdownItem}
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
                    className={styles.dropdownItem}
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
                    className={styles.dropdownItem}
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
                  className={styles.dropdownItem}
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
      <div className={styles.content}>
        {error && (
          <div className={styles.errorBanner}>
            <AlertTriangle />
            <span>Failed to load announcements: {error}</span>
            <button onClick={handleRefresh} className={styles.retryBtn}>
              Retry
            </button>
          </div>
        )}

        {isLoading && announcements.length === 0 ? (
          <div className={styles.loadingState}>
            <RefreshCw className={styles.spinning} />
            <span>Loading announcements...</span>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className={styles.emptyState}>
            {searchTerm || Object.keys(filters).length > 1 ? (
              <>
                <Search className={styles.emptyIcon} />
                <h3 className={styles.emptyTitle}>No announcements found</h3>
                <p className={styles.emptyText}>Try adjusting your search or filters</p>
                <button onClick={() => {
                  setSearchTerm('');
                  clearFilters();
                }} className={styles.clearFiltersBtn}>
                  Clear all filters
                </button>
              </>
            ) : (
              <>
                <Bell className={styles.emptyIcon} />
                <h3 className={styles.emptyTitle}>No announcements yet</h3>
                <p className={styles.emptyText}>Check back later for updates from event staff</p>
                {canCreateAnnouncements && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className={styles.createFirstBtn}
                  >
                    <Plus />
                    Create first announcement
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={styles.list}>
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
        <div className={styles.activeFiltersSummary}>
          <Info className={styles.infoIcon} />
          <span>
            Showing {filteredAnnouncements.length} of {announcements.length} announcements
          </span>
          <button onClick={() => {
            setSearchTerm('');
            clearFilters();
          }} className={styles.clearAllBtn}>
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