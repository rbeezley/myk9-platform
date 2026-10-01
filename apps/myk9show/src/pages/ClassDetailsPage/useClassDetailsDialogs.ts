/**
 * Dialog state hook for ClassDetailsPage
 *
 * Manages all dialog open/close state
 */

import { useState } from 'react';

export function useClassDetailsDialogs() {
  // Edit class panel
  const [editClassPanelOpen, setEditClassPanelOpen] = useState(false);

  // Delete class dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Delete entry dialog
  const [deleteEntryDialogOpen, setDeleteEntryDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  return {
    // Edit class
    editClassPanelOpen,
    setEditClassPanelOpen,
    openEditClassPanel: () => setEditClassPanelOpen(true),
    closeEditClassPanel: () => setEditClassPanelOpen(false),

    // Delete class
    deleteDialogOpen,
    setDeleteDialogOpen,
    openDeleteDialog: () => setDeleteDialogOpen(true),
    closeDeleteDialog: () => setDeleteDialogOpen(false),

    // Delete entry
    deleteEntryDialogOpen,
    setDeleteEntryDialogOpen,
    entryToDelete,
    setEntryToDelete,
    openDeleteEntryDialog: (entryId: string) => {
      setEntryToDelete(entryId);
      setDeleteEntryDialogOpen(true);
    },
    closeDeleteEntryDialog: () => {
      setDeleteEntryDialogOpen(false);
      setEntryToDelete(null);
    },
  };
}
