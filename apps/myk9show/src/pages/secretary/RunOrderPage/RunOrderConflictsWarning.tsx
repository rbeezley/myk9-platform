import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface RunOrderConflictsWarningProps {
  errorConflicts: number;
  onAutoResolve: () => void;
}

export const RunOrderConflictsWarning: React.FC<RunOrderConflictsWarningProps> = ({
  errorConflicts,
  onAutoResolve,
}) => {
  if (errorConflicts <= 0) {
    return null;
  }

  return (
    <Card className="mt-6 border-red-200 bg-red-50">
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <div>
            <h4 className="font-medium text-red-900">Critical Scheduling Conflicts</h4>
            <p className="text-sm text-red-700 mt-1">
              {errorConflicts} critical conflict{errorConflicts !== 1 ? 's' : ''} detected.
              These must be resolved before the trial can proceed.
            </p>
          </div>
          <Button variant="outline" className="ml-auto" onClick={onAutoResolve}>
            Auto-Resolve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
