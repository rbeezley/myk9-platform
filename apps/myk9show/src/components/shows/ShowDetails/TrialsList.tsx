import React, { startTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Trash } from 'lucide-react';
import type { Trial } from '@/components/trials/types/trial.types';

interface TrialsListProps {
  trials: Trial[];
  onAddTrial: () => void;
  onEditTrial: (trial: Trial) => void;
  onDeleteTrial: (trial: Trial) => void;
}

const TrialsList: React.FC<TrialsListProps> = ({
  trials,
  onAddTrial,
  onEditTrial,
  onDeleteTrial,
}) => {
  const navigate = useNavigate();
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Trials</h3>
        <Button
          size="sm"
          onClick={onAddTrial}
          className="text-white hover:text-white/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Trial
        </Button>
      </div>
      {trials.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {trials.map((trial) => (
            <Card key={trial.id} className="relative p-4 bg-card-secondary text-foreground rounded-xl shadow-sm">
              {/* 3-dot menu */}
              <div className="absolute top-2 right-2 z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 p-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startTransition(() => navigate(trial.showId ? `/shows/${trial.showId}/trials/${trial.id}` : `/trials/${trial.id}`))}>
                      <Eye className="w-4 h-4 mr-2" /> View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditTrial(trial)}>
                      <Pencil className="w-4 h-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDeleteTrial(trial)} className="text-red-600">
                      <Trash className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-col gap-2 min-h-[120px]">
                <div className="flex-1">
                  <h4 className="font-medium text-lg mb-1 text-foreground">{trial.type}</h4>
                  <p className="text-xs text-muted-foreground mb-1">{trial.trialNumber}</p>
                  <p className="text-sm text-muted-foreground mb-2">{trial.trialDate}</p>
                </div>
                <span className="self-start inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  {trial.status}
                </span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>No trials found. Add a trial to get started.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={onAddTrial}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Trial
          </Button>
        </div>
      )}
    </div>
  );
};

export default TrialsList;
