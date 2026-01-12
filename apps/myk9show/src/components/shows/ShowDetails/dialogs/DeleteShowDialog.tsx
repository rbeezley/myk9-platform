import React, { useState, useEffect } from "react";
import { useShowStore } from '@/store/showStore';
import { CascadingDeleteDialog } from '@/components/common/CascadingDeleteDialog';
import type { CascadingDeletePreview } from '@/utils/cascadingDelete';
import { logger } from '@/services/LoggingService';

export interface DeleteShowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showId: string;
  showName: string;
  onDelete: () => void;
}

const DeleteShowDialog: React.FC<DeleteShowDialogProps> = ({ 
  open, 
  onOpenChange, 
  showId, 
  onDelete 
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [preview, setPreview] = useState<CascadingDeletePreview | null>(null);
  const { previewCascadingDelete, removeShowCascading } = useShowStore();

  // Load preview when dialog opens
  useEffect(() => {
    if (open && showId) {
      const previewData = previewCascadingDelete(showId);
      setPreview(previewData);
    }
  }, [open, showId, previewCascadingDelete]);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      // Perform cascading delete
      removeShowCascading(showId);
      
      // Call the original onDelete callback
      onDelete();
      
      // Close dialog
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to delete show:', 'shows', {}, error as Error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <CascadingDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      preview={preview}
      onConfirm={handleConfirm}
      entityType="show"
      isDeleting={isDeleting}
    />
  );
};

export default DeleteShowDialog;
