/**
 * Error display component for validation and submission errors
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorState } from '../types';

interface ErrorDisplayProps {
  errors: ErrorState[];
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ errors }) => {
  if (errors.length === 0) return null;

  return (
    <div className="space-y-2">
      {errors.map((error, index) => (
        <Alert key={index} variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium">{error.message}</div>
            {error.details && (
              <div className="text-sm mt-1 space-y-1">
                {Object.entries(error.details).map(([key, value]) => (
                  <div key={key}>{key}: {value}</div>
                ))}
              </div>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};
