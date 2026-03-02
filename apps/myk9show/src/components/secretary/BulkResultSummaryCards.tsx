import { Users, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import type { BulkEntrySummary } from './bulk-result-entry-utils';

interface BulkResultSummaryCardsProps {
  summary: BulkEntrySummary;
}

export function BulkResultSummaryCards({ summary }: BulkResultSummaryCardsProps) {
  return (
    <div className="myk9-show-stats-section">
      <div className="myk9-show-stats-grid">
        <div className="myk9-show-stat-card">
          <div className="myk9-show-stat-layout">
            <div className="myk9-show-stat-icon entries">
              <Users className="w-5 h-5" />
            </div>
            <div className="myk9-show-stat-content">
              <div className="myk9-show-stat-header">
                <div className="myk9-show-stat-title">Total Entries</div>
              </div>
              <div className="myk9-show-stat-number">{summary.totalEntries}</div>
            </div>
          </div>
          <div className="myk9-show-stat-progress">
            <div className="myk9-show-stat-progress-bar entries" style={{ width: '100%' }}></div>
          </div>
        </div>

        <div className="myk9-show-stat-card">
          <div className="myk9-show-stat-layout">
            <div className="myk9-show-stat-icon trials">
              <FileText className="w-5 h-5" />
            </div>
            <div className="myk9-show-stat-content">
              <div className="myk9-show-stat-header">
                <div className="myk9-show-stat-title">With Data</div>
              </div>
              <div className="myk9-show-stat-number">{summary.entriesWithData}</div>
            </div>
          </div>
          <div className="myk9-show-stat-progress">
            <div className="myk9-show-stat-progress-bar trials" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.entriesWithData / summary.totalEntries) * 100) : 0}%` }}></div>
          </div>
        </div>

        <div className="myk9-show-stat-card">
          <div className="myk9-show-stat-layout">
            <div className="myk9-show-stat-icon qualified">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div className="myk9-show-stat-content">
              <div className="myk9-show-stat-header">
                <div className="myk9-show-stat-title">Valid</div>
              </div>
              <div className="myk9-show-stat-number">{summary.validEntries}</div>
            </div>
          </div>
          <div className="myk9-show-stat-progress">
            <div className="myk9-show-stat-progress-bar qualified" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.validEntries / summary.totalEntries) * 100) : 0}%` }}></div>
          </div>
        </div>

        <div className="myk9-show-stat-card">
          <div className="myk9-show-stat-layout">
            <div className="myk9-show-stat-icon classes">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="myk9-show-stat-content">
              <div className="myk9-show-stat-header">
                <div className="myk9-show-stat-title">Invalid</div>
              </div>
              <div className="myk9-show-stat-number">{summary.invalidEntries}</div>
            </div>
          </div>
          <div className="myk9-show-stat-progress">
            <div className="myk9-show-stat-progress-bar classes" style={{ width: `${summary.totalEntries > 0 ? Math.round((summary.invalidEntries / summary.totalEntries) * 100) : 0}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
