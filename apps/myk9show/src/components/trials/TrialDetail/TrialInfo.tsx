import { Card } from '@/components/ui/card';
import { Trial } from '../types/trial.types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { MoreVertical } from 'lucide-react';

interface TrialInfoProps {
  trial: Trial;
  onEdit: () => void;
  onDelete: () => void;
  onAddPhoto: () => void;
}

export const TrialInfo = ({ trial, onEdit, onDelete, onAddPhoto }: TrialInfoProps) => {
  const formatTime = (time?: string) => {
    if (!time) return 'Not started';
    return time;
  };

  return (
    <Card className="p-6 mb-6 bg-card text-foreground shadow-sm rounded-xl">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold mb-1 text-foreground">{trial.showName}</h2>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-muted-foreground">Trial Date: </span>
              <span>{formatDateMMDDYYYY(trial.trialDate)}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Trial Number: </span>
              <span>{trial.trialNumber || 'N/A'}</span>
            </div>
          </div>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1.5">
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
              onClick={onAddPhoto}
            >
              <i className="fas fa-image mr-2"></i> Change Photo
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
              onClick={onEdit}
            >
              <i className="fas fa-edit mr-2"></i> Edit Details
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100 rounded"
              onClick={onDelete}
            >
              <i className="fas fa-trash mr-2"></i> Delete
            </button>
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Event Number</h3>
          <p className="mt-1">{trial.eventNumber || 'N/A'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Type</h3>
          <p className="mt-1">{trial.type || 'N/A'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Order</h3>
          <p className="mt-1">{trial.order || 'N/A'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Planned Start</h3>
          <p className="mt-1">{trial.plannedStartTime || 'Not set'}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Time Started</h3>
          <p className="mt-1">{formatTime(trial.timeStarted)}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Time Ended</h3>
          <p className="mt-1">{formatTime(trial.timeEnded)}</p>
        </div>
      </div>
    </Card>
  );
};
