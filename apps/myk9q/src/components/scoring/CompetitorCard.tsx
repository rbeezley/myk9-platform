import React from 'react';
import { Entry } from '../../stores/entryStore';
import { formatTimeForDisplay } from '../../utils/timeUtils';
import { isNonQualifyingResult } from '../../pages/EntryList/sortableEntryCardUtils';
import { ArmbandBadge } from '../ui';
import './shared-scoring.css';

interface CompetitorCardProps {
  entry: Entry;
  currentPosition: number;
  totalEntries: number;
  showStatus?: boolean;
  className?: string;
}

export const CompetitorCard: React.FC<CompetitorCardProps> = ({
  entry,
  currentPosition,
  totalEntries,
  showStatus = true,
  className = ''
}) => {
  const getStatusBadge = () => {
    if (!showStatus) return null;

    if (entry.status === 'in-ring') {
      return <span className="status-badge in-ring">IN RING</span>;
    }

    if (entry.isScored) {
      return <span className="status-badge scored">{entry.resultText || 'SCORED'}</span>;
    }

    return <span className="status-badge pending">PENDING</span>;
  };

  const getStatusColor = () => {
    if (entry.status === 'in-ring') return 'status-in-ring';
    if (entry.isScored) {
      switch (entry.resultText) {
        case 'Q': return 'status-qualified';
        case 'NQ': return 'status-not-qualified';
        case 'EX': return 'status-excused';
        case 'DQ': return 'status-disqualified';
        default: return 'status-scored';
      }
    }
    return 'status-pending';
  };
  
  return (
    <div className={`competitor-card ${getStatusColor()} ${className}`}>
      <div className="competitor-header">
        <div className="armband-section">
          <ArmbandBadge number={entry.armband} />
          <div className="position-indicator">
            {currentPosition} of {totalEntries}
          </div>
        </div>
        
        <div className="status-section">
          {getStatusBadge()}
        </div>
      </div>
      
      <div className="competitor-info">
        <div className="dog-info">
          <h2 className="dog-name">{entry.callName || 'No Name'}</h2>
          <p className="dog-breed">{entry.breed || 'Unknown Breed'}</p>
        </div>
        
        <div className="handler-info">
          <label>Handler</label>
          <p className="handler-name">{entry.handler || 'Unknown Handler'}</p>
        </div>
        
        {(entry.jumpHeight || entry.preferredTime || entry.section) && (
          <div className="additional-info">
            {entry.jumpHeight && (
              <div className="info-item">
                <label>Jump Height</label>
                <p>{entry.jumpHeight}"</p>
              </div>
            )}
            
            {entry.preferredTime && (
              <div className="info-item">
                <label>Preferred Time</label>
                <p>{entry.preferredTime}</p>
              </div>
            )}
            
            {entry.section && (
              <div className="info-item">
                <label>Section</label>
                <p>{entry.section}</p>
              </div>
            )}
          </div>
        )}
        
        {entry.isScored && (
          <div className="score-summary">
            {(entry.searchTime || entry.resultText) && (
              <div className="score-item">
                <label>Time</label>
                <p>{isNonQualifyingResult(entry.resultText) ? '00:00.00' : formatTimeForDisplay(entry.searchTime || null)}</p>
              </div>
            )}
            
            {entry.faultCount !== null && entry.faultCount !== undefined && (
              <div className="score-item">
                <label>Faults</label>
                <p>{entry.faultCount}</p>
              </div>
            )}
            
            {entry.placement && (
              <div className="score-item">
                <label>Placement</label>
                <p className="placement">#{entry.placement}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};