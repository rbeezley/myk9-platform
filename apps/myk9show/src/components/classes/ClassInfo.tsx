import React from 'react';
import { Calendar, User, Camera, ArrowLeft } from 'lucide-react';
import { ClassData } from './types/classTypes';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';

interface ClassInfoProps {
  classData?: ClassData;
  onEditPhoto?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewTrial?: () => void;
}

const ClassInfo: React.FC<ClassInfoProps> = ({ 
  classData, 
  onEditPhoto, 
  onEdit, 
  onDelete,
  onViewTrial 
}) => {
  if (!classData) {
    return (
      <div className="apple-class-info-card">
        <div className="text-center py-12">
          <h2 className="apple-class-info-title">Class Not Found</h2>
          <p className="text-muted-foreground">The class you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled':
        return 'apple-class-status-scheduled';
      case 'In Progress':
        return 'apple-class-status-in-progress';
      case 'Completed':
        return 'apple-class-status-completed';
      default:
        return 'apple-class-status-scheduled';
    }
  };

  const formatClassTitle = () => {
    const parts = [classData.element];
    if (classData.level) parts.push(classData.level);
    if (classData.section) parts.push(classData.section);
    return parts.join(' ');
  };

  return (
    <div className="apple-class-info-card">
      <div className="apple-class-info-header">
        <div>
          {onViewTrial && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewTrial}
              className="mb-4 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {classData.trial}
            </Button>
          )}
          <h1 className="apple-class-info-title">{formatClassTitle()}</h1>
          <p className="apple-class-info-subtitle">{classData.className}</p>
          <div className={`apple-class-status-badge ${getStatusColor(classData.status)}`}>
            {classData.status}
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              className="h-8 w-8 p-0"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem {...(onEdit !== undefined && { onClick: () => onEdit() })}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem {...(onEdit !== undefined && { onClick: () => onEdit() })}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Class
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              {...(onDelete !== undefined && { onClick: () => onDelete() })}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Class
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Photo Section */}
      <div className="apple-class-photo-section">
        <div className="apple-class-photo">
          {classData.photoUrl ? (
            <img 
              src={classData.photoUrl} 
              alt="Class" 
              className="w-full h-full object-cover rounded-[18px]" 
            />
          ) : (
            <Camera className="h-8 w-8" />
          )}
        </div>
        {onEditPhoto && (
          <button
            className="apple-class-photo-button"
            onClick={onEditPhoto}
          >
            {classData.photoUrl ? 'Change Photo' : 'Add Photo'}
          </button>
        )}
      </div>

      {/* Information Grid */}
      <div className="apple-class-info-grid">
        <div className="apple-class-info-item">
          <div className="apple-class-info-label">Trial</div>
          <div className="apple-class-info-value">{classData.trial}</div>
        </div>

        <div className="apple-class-info-item">
          <div className="apple-class-info-label">Trial Number</div>
          <div className="apple-class-info-value">{classData.trialNumber}</div>
        </div>

        <div className="apple-class-info-item">
          <div className="apple-class-info-label">
            <Calendar className="h-3 w-3 inline mr-1" />
            Trial Date
          </div>
          <div className="apple-class-info-value">
            {new Date(classData.trialDate).toLocaleDateString()}
          </div>
        </div>

        <div className="apple-class-info-item">
          <div className="apple-class-info-label">
            <User className="h-3 w-3 inline mr-1" />
            Judge
          </div>
          <div className="apple-class-info-value">{classData.judge}</div>
        </div>

        <div className="apple-class-info-item">
          <div className="apple-class-info-label">Class Order</div>
          <div className="apple-class-info-value">#{classData.classOrder}</div>
        </div>

        <div className="apple-class-info-item">
          <div className="apple-class-info-label">Entry Fee</div>
          <div className="apple-class-info-value">${classData.entryFee}</div>
        </div>

        <div className="apple-class-info-item">
          <div className="apple-class-info-label">Max Entries</div>
          <div className="apple-class-info-value">{classData.maxEntries}</div>
        </div>

        <div className="apple-class-info-item">
          <div className="apple-class-info-label">Time Limit</div>
          <div className="apple-class-info-value">{classData.timeLimit1}</div>
        </div>

        {classData.hidesUsed && (
          <div className="apple-class-info-item">
            <div className="apple-class-info-label">Hides Used</div>
            <div className="apple-class-info-value">{classData.hidesUsed}</div>
          </div>
        )}

        {classData.distractionsUsed && (
          <div className="apple-class-info-item">
            <div className="apple-class-info-label">Distractions</div>
            <div className="apple-class-info-value">{classData.distractionsUsed}</div>
          </div>
        )}

        {classData.itemsUsed && (
          <div className="apple-class-info-item">
            <div className="apple-class-info-label">Items Used</div>
            <div className="apple-class-info-value">{classData.itemsUsed}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassInfo;
