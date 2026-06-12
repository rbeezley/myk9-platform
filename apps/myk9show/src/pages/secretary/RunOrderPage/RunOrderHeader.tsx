import React, { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Printer, Shuffle } from 'lucide-react';

interface RunOrderHeaderProps {
  trialId: string | undefined;
  showId: string | undefined;
  classCount: number;
  totalConflicts: number;
  errorConflicts: number;
  onOptimize: () => void;
  onExport: (format: 'pdf' | 'csv' | 'json') => void;
}

export const RunOrderHeader: React.FC<RunOrderHeaderProps> = ({
  trialId,
  showId,
  classCount,
  totalConflicts,
  errorConflicts,
  onOptimize,
  onExport,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => startTransition(() => navigate(-1))}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Trial
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Run Order Management</h1>
          <p className="text-muted-foreground">
            {trialId ? `Trial: ${trialId}` : 'No trial selected'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={errorConflicts > 0 ? "destructive" : "default"}>
          {totalConflicts} conflicts
        </Badge>
        <Badge variant="outline">
          {classCount} classes
        </Badge>
        <Button onClick={onOptimize} variant="outline">
          <Shuffle className="h-4 w-4 mr-2" />
          Optimize
        </Button>
        <Button
          variant="outline"
          disabled={!showId}
          onClick={() =>
            showId &&
            startTransition(() =>
              navigate(`/shows/${showId}/reports?report=judge-supply-checklist`)
            )
          }
        >
          <Printer className="h-4 w-4 mr-2" />
          Print Supplies
        </Button>
        <Button onClick={() => onExport('pdf')}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
    </div>
  );
};
