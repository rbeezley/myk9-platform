/**
 * Audit Log Page
 *
 * Displays a searchable, filterable history of all competition admin changes
 * including visibility settings and self check-in configuration changes.
 */

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import {
  formatAuditEntry,
  type AuditLogFilters,
} from '@/services/auditLogService';
import { useAuditLogData } from './hooks/useAuditLogData';
import { HamburgerMenu, OfflineFallback } from '@/components/ui';
import { Clock, Filter, X, User, Calendar, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { styles, getScopeBadgeStyle } from './auditLogStyles';

const AuditLog: React.FC = () => {
  const { licenseKey } = useParams<{ licenseKey: string }>();
  const { isAdmin } = usePermission();

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [limit, setLimit] = useState(100);

  // Use React Query for data fetching
  const {
    entries,
    administrators,
    isLoading: loading,
    isOffline,
    error: queryError,
    refetch
  } = useAuditLogData(licenseKey, filters, limit);

  // Convert error to string for UI display
  const error = queryError ? (queryError as Error).message || 'Failed to load audit log' : null;

  const handleFilterChange = (key: keyof AuditLogFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  // Permission check
  if (!isAdmin()) {
    return (
      <div className="page-container">
        <div className={styles.error}>
          <h2 className={styles.errorTitle}>Access Denied</h2>
          <p className={styles.errorText}>You need administrator permissions to view the audit log.</p>
        </div>
      </div>
    );
  }

  // Offline state - show graceful degradation message
  if (isOffline) {
    return (
      <OfflineFallback
        message="Audit log requires an internet connection. Please reconnect to view change history."
      />
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <HamburgerMenu />
          <div className={styles.headerInfo}>
            <div className={styles.headerTitle}>
              <Clock className={styles.headerIcon} />
              <h1 className={styles.h1}>Audit Log</h1>
            </div>
          </div>
        </div>
        <p className={styles.headerDescription}>
          Track all changes to competition settings including result visibility and self check-in configuration.
        </p>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button
          className={cn(styles.filterToggleBtn, showFilters && styles.filterToggleBtnActive)}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className={styles.btnIcon} />
          <span>Filters</span>
          {hasActiveFilters && (
            <span className={cn(styles.filterBadge, showFilters && styles.filterBadgeActive)}>
              {Object.keys(filters).length}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button className={styles.clearFiltersBtn} onClick={clearFilters}>
            <X className={styles.btnIcon} />
            Clear Filters
          </button>
        )}

        <div className={styles.limitControl}>
          <label htmlFor="limit-select" className={styles.limitLabel}>Show:</label>
          <select
            id="limit-select"
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className={styles.limitSelect}
          >
            <option value={50}>50 entries</option>
            <option value={100}>100 entries</option>
            <option value={250}>250 entries</option>
            <option value={500}>500 entries</option>
          </select>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className={styles.filterPanel}>
          <div className={styles.filterGrid}>
            {/* Scope Filter */}
            <div className={styles.filterGroup}>
              <label htmlFor="scope-filter" className={styles.filterLabel}>Scope</label>
              <select
                id="scope-filter"
                value={filters.scope || ''}
                onChange={e => handleFilterChange('scope', e.target.value)}
                className={styles.filterSelect}
              >
                <option value="">All Scopes</option>
                <option value="Show Level">Show Level</option>
                <option value="Trial Level">Trial Level</option>
                <option value="Class Level">Class Level</option>
              </select>
            </div>

            {/* Administrator Filter */}
            <div className={styles.filterGroup}>
              <label htmlFor="admin-filter" className={styles.filterLabel}>Administrator</label>
              <select
                id="admin-filter"
                value={filters.updated_by || ''}
                onChange={e => handleFilterChange('updated_by', e.target.value)}
                className={styles.filterSelect}
              >
                <option value="">All Administrators</option>
                {administrators.map(admin => (
                  <option key={admin} value={admin}>
                    {admin}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date Filter */}
            <div className={styles.filterGroup}>
              <label htmlFor="start-date-filter" className={styles.filterLabel}>From Date</label>
              <input
                type="date"
                id="start-date-filter"
                value={filters.startDate || ''}
                onChange={e => handleFilterChange('startDate', e.target.value)}
                className={styles.filterDateInput}
              />
            </div>

            {/* End Date Filter */}
            <div className={styles.filterGroup}>
              <label htmlFor="end-date-filter" className={styles.filterLabel}>To Date</label>
              <input
                type="date"
                id="end-date-filter"
                value={filters.endDate || ''}
                onChange={e => handleFilterChange('endDate', e.target.value)}
                className={styles.filterDateInput}
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading audit log...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={styles.error}>
          <p className={styles.errorText}>{error}</p>
          <button onClick={() => refetch()} className={styles.errorButton}>Try Again</button>
        </div>
      )}

      {/* Audit Log Table */}
      {!loading && !error && (
        <>
          {entries.length === 0 ? (
            <div className={styles.noEntries}>
              <Clock className={styles.noEntriesIcon} />
              <p className={styles.noEntriesText}>No audit log entries found</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className={styles.clearFiltersLink}>
                  Clear filters to see all entries
                </button>
              )}
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={cn(styles.th, styles.colTimestamp)}>
                      <span className={styles.thContent}>
                        <Calendar className={styles.thIcon} />
                        When
                      </span>
                    </th>
                    <th className={cn(styles.th, styles.colAdmin)}>
                      <span className={styles.thContent}>
                        <User className={styles.thIcon} />
                        Administrator
                      </span>
                    </th>
                    <th className={cn(styles.th, styles.colScope)}>
                      <span className={styles.thContent}>
                        <Settings className={styles.thIcon} />
                        Scope
                      </span>
                    </th>
                    <th className={cn(styles.th, styles.colChange)}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => {
                    const timestamp = new Date(entry.updated_at);
                    const relativeTime = formatDistanceToNow(timestamp, { addSuffix: true });

                    return (
                      <tr key={index} className={styles.tr}>
                        <td className={cn(styles.td, styles.colTimestamp)}>
                          <div className={styles.timestampCell}>
                            <span className={styles.relativeTime}>{relativeTime}</span>
                            <span className={styles.absoluteTime}>
                              {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                        </td>
                        <td className={cn(styles.td, styles.colAdmin)}>
                          <span className={styles.adminName}>
                            {entry.updated_by || <span className={styles.unknownAdmin}>(Not recorded)</span>}
                          </span>
                        </td>
                        <td className={cn(styles.td, styles.colScope)}>
                          <span className={getScopeBadgeStyle(entry.scope)}>
                            {entry.scope}
                          </span>
                        </td>
                        <td className={cn(styles.td, styles.colChange)}>
                          <div className={styles.changeDescription}>
                            {formatAuditEntry(entry)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Entry Count */}
          {entries.length > 0 && (
            <div className={styles.footer}>
              <p className={styles.footerText}>
                Showing {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                {hasActiveFilters && ' (filtered)'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLog;
