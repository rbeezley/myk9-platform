import { useState } from 'react';
import AddExternalResultDialog, { ExternalResult } from './AddExternalResultDialog';
import EditExternalResultDialog from './EditExternalResultDialog';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { Button } from '@/components/ui/button';

interface ExternalResultsSectionProps {
  results: ExternalResult[];
  addResult: (result: Omit<ExternalResult, 'id'>) => void;
  editResult: (id: string, result: ExternalResult) => void;
  deleteResult: (id: string) => void;
}

export default function ExternalResultsSection({ results, addResult, editResult, deleteResult }: ExternalResultsSectionProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editResultObj, setEditResultObj] = useState<ExternalResult | null>(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Results</h2>
        <Button onClick={() => setAddDialogOpen(true)} variant="default">+ Add Result</Button>
      </div>
      {(results || []).map((result, idx) => (
        <div key={result.id || idx} className="bg-muted p-5 rounded-lg border flex flex-col gap-2 relative">
          <div className="absolute top-4 right-4 z-10">
            <ThreeDotMenu
              items={[
                {
                  label: 'Edit',
                  icon: <span className="w-4 h-4 mr-2">✏️</span>,
                  onClick: () => {
                    setEditResultObj(result);
                    setEditDialogOpen(true);
                  },
                },
                {
                  label: 'Delete',
                  icon: <span className="w-4 h-4 mr-2">🗑️</span>,
                  onClick: () => result.id && deleteResult(String(result.id)),
                  className: 'text-red-600',
                },
              ]}
            />
          </div>
          <div className="font-semibold text-base mb-1">{result.name}</div>
          <div className="text-sm mb-1">{result.date} • {result.location}</div>
          <div className="text-xs text-muted-foreground">Class: {result.className} | Result: {result.result}</div>
          <div className="flex gap-2 mb-1">
            {result.tags && result.tags.map((tag: string) => (
              <span key={tag} className="px-2 py-0.5 rounded bg-green-200 text-xs font-medium text-green-900">{tag}</span>
            ))}
            <span className="text-xs text-gray-500">{result.status}</span>
          </div>
        </div>
      ))}
      <AddExternalResultDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdd={addResult}
      />
      <EditExternalResultDialog
        open={editDialogOpen}
        result={editResultObj}
        onClose={() => setEditDialogOpen(false)}
        onSave={r => {
          if (r.id) editResult(String(r.id), r);
          setEditDialogOpen(false);
        }}
      />
    </div>
  );
}
