import React from 'react';
import { CommonDialog } from '@/components/common/CommonDialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { Achievement } from '@/types/achievement-types';

interface AchievementDetailsDialogProps {
  open: boolean;
  achievement: Achievement | null;
  onClose: () => void;
}

const AchievementDetailsDialog: React.FC<AchievementDetailsDialogProps> = ({ 
  open, 
  achievement, 
  onClose 
}) => {
  if (!achievement) return null;
  
  return (
    <CommonDialog
      open={open}
      onClose={onClose}
      title="Achievement Details"
      description={
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{achievement.title}</h3>
            <button
              onClick={onClose}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="font-medium text-muted-foreground">Date:</span>
              <span>{achievement.date}</span>
            </div>
            
            {achievement.description && (
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-medium text-muted-foreground">Description:</span>
                <span className="whitespace-pre-line">{achievement.description}</span>
              </div>
            )}
            
            {achievement.color && (
              <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                <span className="font-medium text-muted-foreground">Color:</span>
                <div className="flex items-center gap-2">
                  <div 
                    className="h-4 w-4 rounded-full border" 
                    style={{ backgroundColor: achievement.color }}
                  />
                  <span className="text-sm">{achievement.color}</span>
                </div>
              </div>
            )}
            
            {achievement.icon && (
              <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                <span className="font-medium text-muted-foreground">Icon:</span>
                <span className="text-2xl">{achievement.icon}</span>
              </div>
            )}
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            className="px-4"
          >
            Close
          </Button>
        </div>
      }
    >
      <div className="mt-4">
        {/* Additional content if needed */}
      </div>
    </CommonDialog>
  );
};

export default AchievementDetailsDialog;
