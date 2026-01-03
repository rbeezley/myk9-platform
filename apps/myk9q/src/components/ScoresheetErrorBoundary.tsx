import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { logger } from '@/utils/logger';

interface ScoresheetErrorBoundaryProps {
  children: React.ReactNode;
  classId?: string;
  entryId?: string;
}

export const ScoresheetErrorBoundary: React.FC<ScoresheetErrorBoundaryProps> = ({ 
  children, 
  classId,
  entryId 
}) => {
  const navigate = useNavigate();

  const handleBackToEntryList = () => {
    if (classId) {
      navigate(`/class/${classId}/entries`);
    } else {
      navigate(-1);
    }
  };

  const scoresheetErrorFallback = (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
        {/* Error Icon */}
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>

        {/* Scoresheet-specific Error Title */}
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Scoresheet Error
        </h1>

        {/* Context-aware Error Message */}
        <p className="text-gray-600 mb-6">
          There was a problem loading the scoresheet for this entry. 
          This could be due to missing data or a temporary connection issue.
        </p>

        {/* Entry Information */}
        {entryId && (
          <div className="bg-blue-50 rounded p-3 mb-6 text-sm">
            <p className="text-blue-800">
              Entry ID: <span className="font-mono">{entryId}</span>
            </p>
            {classId && (
              <p className="text-blue-800">
                Class ID: <span className="font-mono">{classId}</span>
              </p>
            )}
          </div>
        )}

        {/* Scoresheet-specific Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Scoresheet
          </button>

          <button
            onClick={handleBackToEntryList}
            className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Entry List
          </button>
        </div>

        {/* Judge Instructions */}
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <p className="text-yellow-800 text-sm">
            <strong>For Judges:</strong> If this error persists, please contact the 
            trial secretary or system administrator. You can continue judging other 
            entries by returning to the entry list.
          </p>
        </div>
      </div>
    </div>
  );

  const handleError = (error: Error, _errorInfo: React.ErrorInfo) => {
    // Log scoresheet-specific error details
    logger.error('Scoresheet Error:', {
      error: error.message,
      stack: error.stack,
      componentStack: _errorInfo.componentStack,
      classId,
      entryId,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });

    // In a real application, you might send this to an error reporting service
    // like Sentry, LogRocket, or Bugsnag
  };

  return (
    <ErrorBoundary 
      fallback={scoresheetErrorFallback}
      onError={handleError}
    >
      {children}
    </ErrorBoundary>
  );
};