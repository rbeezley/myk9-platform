import React from 'react';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import ShowSourceBadge from './ShowSourceBadge';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PERMISSIONS } from '@/types/auth-types';
import { Eye, Edit, Trash2 } from 'lucide-react';

interface ShowCardProps {
  show: {
    name: string;
    startDate: string;
    location: string;
    status: string;
    events: string[];
    source: 'myK9Show' | 'external';
  };
  onEdit?: () => void;
  onDelete?: () => void;
  onView?: () => void;
}

const ShowCard: React.FC<ShowCardProps> = ({ show, onEdit, onDelete, onView }) => {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-3 flex flex-col relative">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center mb-1">
            <ShowSourceBadge source={show.source} />
            <span className="font-semibold text-base">{show.name}</span>
          </div>
          <div className="text-sm text-gray-500 mb-1">{formatDateMMDDYYYY(show.startDate)} • {show.location}</div>
        </div>
        <PermissionGuard permission={PERMISSIONS.SHOW_UPDATE}>
          <ThreeDotMenu
            items={[
              { label: 'View Details', icon: <Eye className="w-4 h-4 mr-2" />, onClick: onView ?? (() => {}) },
              { label: 'Edit', icon: <Edit className="w-4 h-4 mr-2" />, onClick: onEdit ?? (() => {}) },
              { label: 'Delete', icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: onDelete ?? (() => {}), className: 'text-red-600' },
            ]}
          />
        </PermissionGuard>
      </div>
      <div className="flex flex-wrap gap-2 mt-2 mb-1">
        {show.events.map((event, i) => (
          <span key={i} className={`px-2 py-0.5 rounded text-xs font-semibold ${event === 'Conformation' ? 'bg-blue-100 text-blue-800' : event === 'Obedience' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>{event}</span>
        ))}
      </div>
      <div className="text-sm text-gray-700 mt-1">{show.status}</div>
    </div>
  );
};

export default ShowCard;
