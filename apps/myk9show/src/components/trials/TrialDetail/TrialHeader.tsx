import { Button } from '@/components/ui/button';
import { Trial } from '../types/trial.types';
import { MoreVertical, Calendar, MapPin, Clock, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { formatStartTime } from '@/components/schedule/schedule-timeline.utils';
import '@/styles/myk9-show-details.css';

interface TrialHeaderProps {
  trial: Trial;
  onEdit: () => void;
  onDelete: () => void;
  onAddPhoto: () => void;
}

export const TrialHeader = ({ trial, onEdit, onDelete, onAddPhoto }: TrialHeaderProps) => {
  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'upcoming':
        return 'myk9-show-status-upcoming';
      case 'in progress':
        return 'myk9-show-status-in-progress';
      case 'completed':
        return 'myk9-show-status-completed';
      case 'cancelled':
        return 'myk9-show-status-cancelled';
      default:
        return 'myk9-show-status-upcoming';
    }
  };

  return (
    <div className="p-8">
      {/* Header with Title and Status */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-foreground">{trial.showName}</h1>
          <span className={`myk9-show-status ${getStatusClass(trial.status)}`}>{trial.status}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Trial options">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onAddPhoto} className="text-sm py-2">
              Add Photo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} className="text-sm py-2">
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-sm py-2 text-red-600" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Trial Details Grid */}
      <div className="myk9-show-info-grid">
        <div className="myk9-show-info-item">
          <div className="myk9-show-info-label">Trial Date</div>
          <div className="myk9-show-info-value flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            {trial.trialDate ? formatDateMMDDYYYY(trial.trialDate) : 'N/A'}
          </div>
        </div>
        <div className="myk9-show-info-item">
          <div className="myk9-show-info-label">Type</div>
          <div className="myk9-show-info-value flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            {trial.type || 'Obedience'}
          </div>
        </div>
        <div className="myk9-show-info-item">
          <div className="myk9-show-info-label">Trial Number</div>
          <div className="myk9-show-info-value flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            {trial.trialNumber || 'T-2025-001'}
          </div>
        </div>
        <div className="myk9-show-info-item">
          <div className="myk9-show-info-label">Planned Start</div>
          <div className="myk9-show-info-value flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {formatStartTime(trial.plannedStartTime ?? null) || 'TBD'}
          </div>
        </div>
        <div className="myk9-show-info-item">
          <div className="myk9-show-info-label">Order</div>
          <div className="myk9-show-info-value flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            {trial.order || '1'}
          </div>
        </div>
        <div className="myk9-show-info-item">
          <div className="myk9-show-info-label">Event Number</div>
          <div className="myk9-show-info-value flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            {trial.eventNumber || 'EV-2025-001'}
          </div>
        </div>
      </div>
    </div>
  );
};
