import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import './shared-ui.css';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'Unable to load data',
  onRetry,
  isRetrying = false
}) => {
  return (
    <div className="error-state">
      <div className="error-state-content">
        <AlertCircle className="error-icon" size={48}  style={{ width: '48px', height: '48px', flexShrink: 0 }} />
        <h3 className="error-title">Oops!</h3>
        <p className="error-message">{message}</p>
        {onRetry && (
          <button
            className={`error-retry-button ${isRetrying ? 'retrying' : ''}`}
            onClick={onRetry}
            disabled={isRetrying}
          >
            <RefreshCw className={`retry-icon ${isRetrying ? 'spinning' : ''}`} size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            {isRetrying ? 'Retrying...' : 'Try Again'}
          </button>
        )}
      </div>
    </div>
  );
};
