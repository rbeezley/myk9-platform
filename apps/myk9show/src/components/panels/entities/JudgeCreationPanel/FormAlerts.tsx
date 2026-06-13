import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DuplicateWarningProps {
  message: string | null;
}

export const DuplicateWarning: React.FC<DuplicateWarningProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="rounded-lg bg-warning/10 border border-warning/30 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium text-warning text-sm">Possible Duplicate</h4>
          <p className="text-sm text-warning mt-1">{message}</p>
          <p className="text-xs text-warning mt-2">
            You can still proceed if this is a different judge.
          </p>
        </div>
      </div>
    </div>
  );
};

interface SubmitErrorProps {
  message: string | undefined;
}

export const SubmitError: React.FC<SubmitErrorProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
        <p className="text-sm text-destructive">{message}</p>
      </div>
    </div>
  );
};
