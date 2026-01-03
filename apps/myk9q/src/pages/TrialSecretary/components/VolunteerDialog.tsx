/**
 * Volunteer Dialog Component
 *
 * Dialog for creating and editing volunteers.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Volunteer } from '../types';

interface VolunteerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (volunteer: Omit<Volunteer, 'id'>) => void;
  volunteer?: Volunteer | null;
}

export function VolunteerDialog({
  isOpen,
  onClose,
  onSave,
  volunteer,
}: VolunteerDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isExhibitor, setIsExhibitor] = useState(false);

  // Reset form when dialog opens/closes or volunteer changes - intentional setState in effect
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen && volunteer) {
      setName(volunteer.name);
      setPhone(volunteer.phone || '');
      setNotes(volunteer.notes || '');
      setIsExhibitor(volunteer.isExhibitor);
    } else if (isOpen) {
      setName('');
      setPhone('');
      setNotes('');
      setIsExhibitor(false);
    }
  }, [isOpen, volunteer]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      isExhibitor,
      exhibitorId: volunteer?.exhibitorId,
      enteredClassIds: volunteer?.enteredClassIds || [],
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog-content volunteer-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2>{volunteer ? 'Edit Volunteer' : 'Add Volunteer'}</h2>
          <button className="dialog-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="dialog-body">
            <div className="form-group">
              <label htmlFor="volunteer-name">Name *</label>
              <input
                id="volunteer-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter volunteer name"
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="volunteer-phone">Phone</label>
              <input
                id="volunteer-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional phone number"
              />
            </div>

            <div className="form-group">
              <label htmlFor="volunteer-notes">Notes</label>
              <textarea
                id="volunteer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Availability or other notes"
                rows={2}
              />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isExhibitor}
                  onChange={(e) => setIsExhibitor(e.target.checked)}
                />
                <span>This person is also an exhibitor</span>
              </label>
              {isExhibitor && (
                <p className="form-hint">
                  Conflicts will be shown when assigning to classes they're
                  entered in.
                </p>
              )}
            </div>
          </div>

          <div className="dialog-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!name.trim()}
            >
              {volunteer ? 'Save Changes' : 'Add Volunteer'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
