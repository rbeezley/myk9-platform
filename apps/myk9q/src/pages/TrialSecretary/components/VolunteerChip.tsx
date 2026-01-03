/**
 * Volunteer Chip Component
 *
 * A small, draggable chip representing a volunteer assignment.
 */

import { useDraggable } from '@dnd-kit/core';
import { AlertTriangle, X } from 'lucide-react';
import type { Volunteer } from '../types';

interface VolunteerChipProps {
  volunteer: Volunteer;
  hasConflict?: boolean;
  onRemove?: () => void;
  isDragOverlay?: boolean;
}

export function VolunteerChip({
  volunteer,
  hasConflict = false,
  onRemove,
  isDragOverlay = false,
}: VolunteerChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: volunteer.id,
    disabled: isDragOverlay,
  });

  // Get first name or initials for compact display
  const displayName = volunteer.name.split(' ')[0];

  return (
    <div
      ref={setNodeRef}
      className={`volunteer-chip ${hasConflict ? 'conflict' : ''} ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      {hasConflict && (
        <AlertTriangle size={12} className="conflict-icon" aria-label="Volunteer is entered in this class" />
      )}
      <span>{displayName}</span>
      {onRemove && !isDragOverlay && (
        <button
          className="remove-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Remove"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
