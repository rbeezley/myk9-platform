import React, { useState, useEffect } from 'react';
import { useShowStore } from '@/store/showStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { supabase } from '@/lib/supabase';
import { CascadingDeleteDialog } from '@/components/common/CascadingDeleteDialog';
import { previewCascadingDelete as buildPreview } from '@/utils/cascadingDelete';
import type { CascadingDeletePreview } from '@/utils/cascadingDelete';
import { logger } from '@/services/LoggingService';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/utils/errorMessages';

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
  const { isAdmin } = useAuthContext();

  // Load preview when dialog opens
  useEffect(() => {
    if (open && showId) {
      const previewData = buildPreview(showId, showName || 'Unnamed Show');
      setPreview(previewData);
    }
  }, [open, showId, showName]);

  const handleConfirm = async (permanent?: boolean) => {
    setIsDeleting(true);
    try {
      if (permanent) {
        // Hard delete via RPC (site admin only)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.rpc as any)('hard_delete_show', { p_show_id: showId });
        if (error) throw new Error(error.message);
        // Remove from local stores
        useShowStore.getState().removeShow(showId);
        toast.success('Show permanently deleted');
      } else {
        // Soft delete (cascading)
        await deleteShowCascading(showId);
        toast.success('Show deleted');
      }

      onDelete();
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to delete show:', 'shows', {}, error as Error);
      toast.error(getUserFriendlyError(error));
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
      allowPermanentDelete={isAdmin}
    />
  );
};

export default DeleteShowDialog;
