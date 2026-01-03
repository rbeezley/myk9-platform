import React from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import type { Show } from '@/types/show-types';
import type { Competition } from '@/types/competition-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { X } from 'lucide-react';

export type { Show as ExternalShow } from '@/types/show-types';

interface ShowDetailsDialogProps {
  open: boolean;
  show: Show | Competition | null;
  onClose: () => void;
}

const ShowDetailsDialog: React.FC<ShowDetailsDialogProps> = ({ open, show, onClose }) => {
  if (!show) return null;
  
  return (
    <StandardDialog
      open={open}
      title="Show Details"
      description="View all show details."
      onClose={onClose}
      saveLabel="Close"
      cancelLabel=""
      onSave={onClose}
      saveIcon={<X className="w-4 h-4 mr-2" />}
    >
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Show Name</label>
          <div>{show.name}</div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Date</label>
          <div>{'startDate' in show ? formatDateMMDDYYYY(show.startDate) : 'date' in show ? formatDateMMDDYYYY(show.date) : ''}</div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Location</label>
          <div>{show.location}</div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Status</label>
          <div>{show.status}</div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Source</label>
          <div>{'source' in show ? show.source : '-'}</div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Events</label>
          <div>{'events' in show && Array.isArray(show.events) && show.events.length > 0 ? show.events.join(', ') : '-'}</div>
        </div>
      </div>
    </StandardDialog>
  );
};

export default ShowDetailsDialog;
