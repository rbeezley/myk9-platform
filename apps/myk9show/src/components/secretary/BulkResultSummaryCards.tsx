import { Users, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import type { BulkEntrySummary } from './bulk-result-entry-utils';

interface BulkResultSummaryCardsProps {
  summary: BulkEntrySummary;
}

export function BulkResultSummaryCards({ summary }: BulkResultSummaryCardsProps) {
  return (
    <div className="apple-show-stats-section">
      <div className="apple-show-stats-grid">
        <div className="apple-show-stat-card">
          <div className="apple-show-stat-layout">
            <div className="apple-show-stat-icon entries">
              <Users className="w-5 h-5" />
            </div>
            <div className="apple-show-stat-content">
              <div className="apple-show-stat-header">
                <div className="apple-show-stat-title">Total Entries</div>
              </div>
              <div className="apple-show-stat-number">{summary.totalEntries}</div>
            </div>
          </div>
          <div className="apple-show-stat-progress">
            <div className="apple-show-stat-progress-bar entries" style={{ width: '100%' }}></div>
          </div>
        </div>

        <div className="apple-show-stat-card">
          <div className="apple-show-stat-layout">
            <div className="apple-show-stat-icon trials">
              <FileText className="w-5 h-5" />
            </div>
            <div className="apple-show-stat-content">
              <div className="apple-show-stat-header">
                <div className="apple-show-stat-title">With Data</div>
              </div>
              <div className="apple-show-stat-number">{summary.entriesWithData}</div>
            </div>
          </div>
          <div className="apple-show-stat-progress">
            <div className="apple-show-stat-progress-bar trials" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.entriesWithData / summary.totalEntries) * 100) : 0}%` }}></div>
          </div>
        </div>

        <div className="apple-show-stat-card">
          <div className="apple-show-stat-layout">
            <div className="apple-show-stat-icon qualified">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div className="apple-show-stat-content">
              <div className="apple-show-stat-header">
                <div className="apple-show-stat-title">Valid</div>
              </div>
              <div className="apple-show-stat-number">{summary.validEntries}</div>
            </div>
          </div>
          <div className="apple-show-stat-progress">
            <div className="apple-show-stat-progress-bar qualified" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.validEntries / summary.totalEntries) * 100) : 0}%` }}></div>
          </div>
        </div>

        <div className="apple-show-stat-card">
          <div className="apple-show-stat-layout">
            <div className="apple-show-stat-icon classes">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="apple-show-stat-content">
              <div className="apple-show-stat-header">
                <div className="apple-show-stat-title">Invalid</div>
              </div>
              <div className="apple-show-stat-number">{summary.invalidEntries}</div>
            </div>
          </div>
          <div className="apple-show-stat-progress">
            <div className="apple-show-stat-progress-bar classes" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.invalidEntries / summary.totalEntries) * 100) : 0}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
