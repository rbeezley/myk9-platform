import React, { startTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Hash, Pencil, Trash, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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

  const handleViewDetails = (trial: Trial) => {
    startTransition(() =>
      navigate(trial.showId ? `/shows/${trial.showId}/trials/${trial.id}` : `/trials/${trial.id}`)
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Trials</h3>
        <Button size="sm" onClick={onAddTrial} className="text-white hover:text-white/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Trial
        </Button>
      </div>
      {trials.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {trials.map(trial => (
            <Card
              key={trial.id}
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Top bar: status badge + 3-dot menu */}
              <div className="absolute top-4 left-0 right-0 flex justify-between items-start px-4 z-10">
                <Badge
                  variant={trial.status.toLowerCase() === 'published' ? 'default' : 'secondary'}
                >
                  {trial.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 p-0 bg-card/80 backdrop-blur-sm rounded-full border border-border/50 hover:bg-card"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditTrial(trial)}>
                      <Pencil className="w-4 h-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDeleteTrial(trial)} className="text-red-600">
                      <Trash className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <CardHeader className="pb-0 pt-14 relative">
                <h4 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors duration-300">
                  {trial.type ?? trial.name ?? 'Trial'}
                </h4>
                <div className="flex items-center text-muted-foreground text-sm mb-2">
                  <Calendar className="w-4 h-4 mr-2" />
                  <span>{trial.trialDate}</span>
                </div>
                <div className="flex items-center text-muted-foreground text-sm mb-2">
                  <Hash className="w-4 h-4 mr-2" />
                  <span>{trial.trialNumber}</span>
                </div>
              </CardHeader>

              <CardContent className="relative">
                <Button
                  onClick={() => handleViewDetails(trial)}
                  className="w-full mt-2 text-sm sm:text-base truncate"
                >
                  View Details
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>No trials found. Add a trial to get started.</p>
          <Button variant="outline" className="mt-4" onClick={onAddTrial}>
            <Plus className="h-4 w-4 mr-2" />
            Add Trial
          </Button>
        </div>
      )}
    </div>
  );
};

export default TrialsList;
