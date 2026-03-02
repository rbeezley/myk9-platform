/**
 * Dialog state hook for ClassDetailsPage
 *
 * Manages all dialog open/close state
 */

import { useState } from 'react';

export function useClassDetailsDialogs() {
  // Edit class panel
  const [editClassPanelOpen, setEditClassPanelOpen] = useState(false);

  // Edit entry dialog
  const [editEntryDialogOpen, setEditEntryDialogOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);

  // Delete class dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Add entry dialog
  const [addEntryDialogOpen, setAddEntryDialogOpen] = useState(false);

  // Delete entry dialog
  const [deleteEntryDialogOpen, setDeleteEntryDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  return {
    // Edit class
    editClassPanelOpen,
    setEditClassPanelOpen,
    openEditClassPanel: () => setEditClassPanelOpen(true),
    closeEditClassPanel: () => setEditClassPanelOpen(false),

    // Edit entry
    editEntryDialogOpen,
    setEditEntryDialogOpen,
    editEntryId,
    setEditEntryId,
    openEditEntryDialog: (entryId: string) => {
      setEditEntryId(entryId);
      setEditEntryDialogOpen(true);
    },
    closeEditEntryDialog: () => {
      setEditEntryDialogOpen(false);
      setEditEntryId(null);
    },

    // Delete class
    deleteDialogOpen,
    setDeleteDialogOpen,
    openDeleteDialog: () => setDeleteDialogOpen(true),
    closeDeleteDialog: () => setDeleteDialogOpen(false),

    // Add entry
    addEntryDialogOpen,
    setAddEntryDialogOpen,
    openAddEntryDialog: () => setAddEntryDialogOpen(true),
    closeAddEntryDialog: () => setAddEntryDialogOpen(false),

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
