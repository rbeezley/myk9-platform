import React, { useState, useEffect } from 'react';
import { useShowStore } from '@/store/showStore';
import { CascadingDeleteDialog } from '@/components/common/CascadingDeleteDialog';
import { previewCascadingDelete as buildPreview } from '@/utils/cascadingDelete';
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
  showName,
  onDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [preview, setPreview] = useState<CascadingDeletePreview | null>(null);
  const { deleteShowCascading } = useShowStore();

  // Load preview when dialog opens — use cascadingDelete utility directly
  // instead of showStore wrapper, since the show may not be in the Zustand store
  useEffect(() => {
    if (open && showId) {
      const previewData = buildPreview(showId, showName || 'Unnamed Show');
      setPreview(previewData);
    }
  }, [open, showId, showName]);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      // Perform async cascading delete (handles replicated table + local store)
      await deleteShowCascading(showId);

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
