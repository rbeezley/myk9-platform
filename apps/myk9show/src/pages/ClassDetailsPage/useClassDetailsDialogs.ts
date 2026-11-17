/**
 * Dialog state hook for ClassDetailsPage
 *
 * Manages all dialog open/close state
 */

import { useState } from 'react';

export function useClassDetailsDialogs() {
  // Edit class panel
  const [editClassPanelOpen, setEditClassPanelOpen] = useState(false);

  return {
    // Edit class
    editClassPanelOpen,
    setEditClassPanelOpen,
    openEditClassPanel: () => setEditClassPanelOpen(true),
    closeEditClassPanel: () => setEditClassPanelOpen(false),
  };
}
