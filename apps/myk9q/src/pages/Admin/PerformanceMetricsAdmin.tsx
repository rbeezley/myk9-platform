/**
 * Performance Metrics Admin Dashboard
 *
 * View performance metrics, errors, and analytics for the current show
 * Only accessible by admins - shows data for their logged-in show context
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { metricsApiService, SessionSummaryRecord } from '@/services/metricsApiService';
import { usePerformanceMetricsData } from './hooks/usePerformanceMetricsData';
import { HamburgerMenu, OfflineFallback } from '@/components/ui';
import './PerformanceMetricsAdmin.css';

export function PerformanceMetricsAdmin() {
  const { showContext } = useAuth();

  const [selectedDays, setSelectedDays] = useState(7);
  const [selectedSession, setSelectedSession] = useState<SessionSummaryRecord | null>(null);

  // Use React Query for data fetching
  const {
    sessions,
    stats,
    isLoading: loading,
    isOffline,
  } = usePerformanceMetricsData(showContext?.licenseKey, selectedDays);

  if (!showContext?.licenseKey) {
    return <div className="error-message">Not authorized</div>;
  }

  // Offline state - show graceful degradation message
  if (isOffline) {
    return (
      <OfflineFallback
        message="Performance metrics require an internet connection. Please reconnect to view analytics."
      />
    );
  }

  return (
    <div className="metrics-admin">
      <HamburgerMenu />

      <div className="metrics-header">
        <h1>📊 Performance Metrics - {showContext?.showName || 'Current Show'}</h1>
        <div className="header-controls">
          <select
            value={selectedDays}
            onChange={(e) => setSelectedDays(Number(e.target.value))}
            className="days-select"
          >
            <option value={1}>Last 24 Hours</option>
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
          <button
            onClick={async () => {
              if (sessions.length > 0) {
                const csv = await metricsApiService.exportMetricsAsCSV(
                  showContext.licenseKey,
                  selectedDays
                );
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `metrics-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
              }
            }}
            className="export-btn"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {stats && (
        <div className="stats-summary">
          <div className="stat-card">
            <div className="stat-label">Total Sessions</div>
            <div className="stat-value">{stats.total_sessions}</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-label">High Error Sessions</div>
            <div className="stat-value">{stats.high_error_sessions}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Offline Heavy Sessions</div>
            <div className="stat-value">{stats.offline_heavy_sessions}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Sync Conflicts</div>
            <div className="stat-value">{stats.sync_conflict_sessions}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Duration</div>
            <div className="stat-value">{(stats.avg_duration_ms / 1000).toFixed(1)}s</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading metrics...</div>
      ) : (
        <div className="metrics-content">
          <div className="sessions-list">
            <h2>Sessions</h2>
            {sessions.length === 0 ? (
              <div className="empty-state">No metrics recorded yet</div>
            ) : (
              <div className="sessions-table">
                <div className="table-header">
                  <div className="col-id">Session</div>
                  <div className="col-time">Start Time</div>
                  <div className="col-duration">Duration</div>
                  <div className="col-device">Device</div>
                  <div className="col-errors">Errors</div>
                  <div className="col-fcp">FCP</div>
                  <div className="col-lcp">LCP</div>
                  <div className="col-action">Action</div>
                </div>
                {sessions.map((session) => (
                  <div
                    key={session.session_id}
                    className={`table-row ${session.error_count > 0 ? 'has-errors' : ''}`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="col-id">
                      <code>{session.session_id.substring(0, 8)}...</code>
                    </div>
                    <div className="col-time">
                      {new Date(session.start_time).toLocaleString()}
                    </div>
                    <div className="col-duration">
                      {(session.duration_ms || 0 / 1000).toFixed(1)}s
                    </div>
                    <div className="col-device">{session.device_type}</div>
                    <div className="col-errors">
                      {session.error_count > 0 && (
                        <span className="error-badge">{session.error_count}</span>
                      )}
                    </div>
                    <div className="col-fcp">
                      {session.fcp_ms ? `${session.fcp_ms.toFixed(0)}ms` : '-'}
                    </div>
                    <div className="col-lcp">
                      {session.lcp_ms ? `${session.lcp_ms.toFixed(0)}ms` : '-'}
                    </div>
                    <div className="col-action">
                      <button className="view-btn">View</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedSession && (
            <div className="session-detail">
              <div className="detail-header">
                <h2>Session Details</h2>
                <button className="close-btn" onClick={() => setSelectedSession(null)}>
                  ✕
                </button>
              </div>

              <div className="detail-content">
                <div className="detail-section">
                  <h3>Session Information</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="label">Session ID:</span>
                      <code>{selectedSession.session_id}</code>
                    </div>
                    <div className="detail-item">
                      <span className="label">Start Time:</span>
                      <span>
                        {new Date(selectedSession.start_time).toLocaleString()}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Duration:</span>
                      <span>{selectedSession.duration_ms ? (selectedSession.duration_ms / 1000).toFixed(1) : '-'}s</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Device:</span>
                      <span>{selectedSession.device_type}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Performance Metrics</h3>
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-name">FCP</div>
                      <div className="metric-value">
                        {selectedSession.fcp_ms?.toFixed(0) || '-'}ms
                      </div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-name">LCP</div>
                      <div className="metric-value">
                        {selectedSession.lcp_ms?.toFixed(0) || '-'}ms
                      </div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-name">CLS</div>
                      <div className="metric-value">
                        {selectedSession.cls_score?.toFixed(3) || '-'}
                      </div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-name">FID</div>
                      <div className="metric-value">
                        {selectedSession.fid_ms?.toFixed(0) || '-'}ms
                      </div>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Issues</h3>
                  <div className="issues-grid">
                    <div className="issue-item">
                      <span className="label">Errors:</span>
                      <span className="value">{selectedSession.error_count}</span>
                    </div>
                    <div className="issue-item">
                      <span className="label">Warnings:</span>
                      <span className="value">{selectedSession.warning_count}</span>
                    </div>
                    <div className="issue-item">
                      <span className="label">Slow Actions:</span>
                      <span className="value">{selectedSession.slow_actions_count}</span>
                    </div>
                    <div className="issue-item">
                      <span className="label">Failed Actions:</span>
                      <span className="value">{selectedSession.failed_actions_count}</span>
                    </div>
                    <div className="issue-item">
                      <span className="label">Sync Conflicts:</span>
                      <span className="value">{selectedSession.sync_conflicts}</span>
                    </div>
                    <div className="issue-item">
                      <span className="label">Offline Events:</span>
                      <span className="value">{selectedSession.offline_events}</span>
                    </div>
                  </div>
                </div>

                {selectedSession.full_report && (
                  <div className="detail-section">
                    <h3>Raw Report</h3>
                    <pre className="json-view">
                      {JSON.stringify(selectedSession.full_report, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
