import { Users, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface SummaryCardsProps {
  totalEntries: number;
  entriesWithData: number;
  validEntries: number;
  invalidEntries: number;
}

export function SummaryCards({
  totalEntries,
  entriesWithData,
  validEntries,
  invalidEntries
}: SummaryCardsProps) {
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
              <div className="apple-show-stat-number">{totalEntries}</div>
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
              <div className="apple-show-stat-number">{entriesWithData}</div>
            </div>
          </div>
          <div className="apple-show-stat-progress">
            <div className="apple-show-stat-progress-bar trials" style={{ width: `${totalEntries > 0 ? Math.round((entriesWithData / totalEntries) * 100) : 0}%` }}></div>
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
              <div className="apple-show-stat-number">{validEntries}</div>
            </div>
          </div>
          <div className="apple-show-stat-progress">
            <div className="apple-show-stat-progress-bar qualified" style={{ width: `${totalEntries > 0 ? Math.round((validEntries / totalEntries) * 100) : 0}%` }}></div>
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
              <div className="apple-show-stat-number">{invalidEntries}</div>
            </div>
          </div>
          <div className="apple-show-stat-progress">
            <div className="apple-show-stat-progress-bar classes" style={{ width: `${totalEntries > 0 ? Math.round((invalidEntries / totalEntries) * 100) : 0}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
