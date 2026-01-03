/**
 * Volunteer Pool Component
 *
 * Displays available volunteers that can be dragged to assignments.
 */

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Plus, User, Pencil, Trash2, GripVertical } from 'lucide-react';
import type { Volunteer } from '../types';

interface VolunteerPoolProps {
  volunteers: Volunteer[];
  /** When true, disables all editing features (add, edit, delete, drag) */
  isReadOnly?: boolean;
  onAddVolunteer?: () => void;
  onEditVolunteer?: (volunteer: Volunteer) => void;
  onDeleteVolunteer?: (volunteerId: string) => void;
}

export function VolunteerPool({
  volunteers,
  isReadOnly = false,
  onAddVolunteer,
  onEditVolunteer,
  onDeleteVolunteer,
}: VolunteerPoolProps) {
  return (
    <div className="volunteer-pool">
      <div className="volunteer-pool-header">
        <h3 className="volunteer-pool-title">Available Volunteers</h3>
        <span className="volunteer-pool-count">{volunteers.length}</span>
      </div>

      <p className="volunteer-pool-hint">
        <GripVertical size={14} />
        <span>Drag volunteers to General Duties or Class Assignments below</span>
      </p>

      <div className="volunteer-pool-content">
        {volunteers.map((volunteer) => (
          <DraggableVolunteerCard
            key={volunteer.id}
            volunteer={volunteer}
            isReadOnly={isReadOnly}
            onEdit={onEditVolunteer ? () => onEditVolunteer(volunteer) : undefined}
            onDelete={onDeleteVolunteer ? () => onDeleteVolunteer(volunteer.id) : undefined}
          />
        ))}

        {!isReadOnly && onAddVolunteer && (
          <button className="volunteer-add-button" onClick={onAddVolunteer}>
            <Plus size={16} />
            <span>Add Volunteer</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface DraggableVolunteerCardProps {
  volunteer: Volunteer;
  isReadOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

function DraggableVolunteerCard({
  volunteer,
  isReadOnly = false,
  onEdit,
  onDelete,
}: DraggableVolunteerCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: volunteer.id,
    disabled: isReadOnly,
  });

  const [showActions, setShowActions] = React.useState(false);

  return (
    <div
      ref={setNodeRef}
      className={`volunteer-card ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <User size={16} className="volunteer-card-icon" />
      <span className="volunteer-card-name">{volunteer.name}</span>
      {volunteer.isExhibitor && (
        <span className="volunteer-card-badge">Exhibitor</span>
      )}

      {!isReadOnly && showActions && (
        <div className="volunteer-card-actions">
          {onEdit && (
            <button
              className="volunteer-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Edit"
            >
              <Pencil size={12} />
            </button>
          )}
          {onDelete && (
            <button
              className="volunteer-action-btn delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
