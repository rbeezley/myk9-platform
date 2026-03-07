import React from 'react';
import { ArrowLeft, RefreshCw, List } from 'lucide-react';
import { ErrorState } from '../../components/ui';

export const ClassListLoading: React.FC = () => (
  <div className="class-list-container">
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin mx-auto mb-2" />
        <p className="text-muted-foreground">Loading classes...</p>
      </div>
    </div>
  </div>
);

interface ErrorStateProps {
  errorMessage: string;
  onRetry: () => void;
  isRetrying: boolean;
}

export const ClassListError: React.FC<ErrorStateProps> = ({
  errorMessage,
  onRetry,
  isRetrying,
}) => (
  <div className="class-list-container">
    <ErrorState
      message={`Failed to load classes: ${errorMessage || 'Please check your connection and try again.'}`}
      onRetry={onRetry}
      isRetrying={isRetrying}
    />
  </div>
);

interface NotFoundStateProps {
  onGoBack: () => void;
}

export const ClassListNotFound: React.FC<NotFoundStateProps> = ({ onGoBack }) => (
  <div className="class-list-container">
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-foreground text-lg font-semibold mb-2">Trial not found</p>
        <button onClick={onGoBack} className="icon-button">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </button>
      </div>
    </div>
  </div>
);

interface EmptyStateProps {
  trialName?: string;
  onGoBack: () => void;
}

export const ClassListEmpty: React.FC<EmptyStateProps> = ({ trialName, onGoBack }) => (
  <div className="class-list-container">
    <div className="empty-state">
      <div className="empty-state-icon">
        <List size={40} strokeWidth={1.5} />
      </div>
      <h2 className="empty-state-title">No Classes Yet</h2>
      {trialName && <p className="empty-state-context">{trialName}</p>}
      <p className="empty-state-message">
        This trial doesn't have any classes set up yet. Classes will appear here once they're added.
      </p>
      <div className="empty-state-action">
        <button onClick={onGoBack}>
          <ArrowLeft size={16} />
          Go Back
        </button>
      </div>
    </div>
  </div>
);
