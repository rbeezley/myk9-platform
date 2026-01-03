/**
 * Role Config Dialog Component
 *
 * Dialog for managing steward roles (enabling/disabling, adding custom roles).
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2 } from 'lucide-react';
import type { ScheduleRole } from '../types';

interface RoleConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  roles: ScheduleRole[];
  onSave: (roles: ScheduleRole[]) => void;
}

export function RoleConfigDialog({
  isOpen,
  onClose,
  roles,
  onSave,
}: RoleConfigDialogProps) {
  const [editedRoles, setEditedRoles] = useState<ScheduleRole[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleType, setNewRoleType] = useState<'ring' | 'general'>('ring');

  // Reset form when dialog opens - intentional setState in effect for dialog initialization
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      setEditedRoles([...roles]);
      setNewRoleName('');
    }
  }, [isOpen, roles]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleToggleRole = (roleId: string) => {
    setEditedRoles(prev =>
      prev.map(role =>
        role.id === roleId ? { ...role, isActive: !role.isActive } : role
      )
    );
  };

  const handleAddRole = () => {
    if (!newRoleName.trim()) return;

    const newRole: ScheduleRole = {
      id: `custom-${Date.now()}`,
      name: newRoleName.trim(),
      color: getRandomColor(),
      isRingRole: newRoleType === 'ring',
      isActive: true,
    };

    setEditedRoles(prev => [...prev, newRole]);
    setNewRoleName('');
  };

  const handleDeleteRole = (roleId: string) => {
    // Only allow deleting custom roles - defaults can be toggled off instead
    if (!roleId.startsWith('custom-')) return;
    setEditedRoles(prev => prev.filter(role => role.id !== roleId));
  };

  const handleSave = () => {
    onSave(editedRoles);
    onClose();
  };

  if (!isOpen) return null;

  const ringRoles = editedRoles.filter(r => r.isRingRole);
  const generalRoles = editedRoles.filter(r => !r.isRingRole);

  return createPortal(
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog-content role-config-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2>Manage Roles</h2>
          <button className="dialog-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="dialog-body">
          {/* Ring Roles Section */}
          <div className="role-section">
            <h3>Ring Roles (Per Class)</h3>
            <p className="role-section-hint">
              These roles are assigned to each class (e.g., Gate Steward, Timer).
            </p>
            <div className="role-list">
              {ringRoles.map(role => (
                <RoleItem
                  key={role.id}
                  role={role}
                  onToggle={() => handleToggleRole(role.id)}
                  onDelete={
                    role.id.startsWith('custom-')
                      ? () => handleDeleteRole(role.id)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>

          {/* General Roles Section */}
          <div className="role-section">
            <h3>General Duties</h3>
            <p className="role-section-hint">
              These roles span across classes (e.g., Hospitality, Equipment).
            </p>
            <div className="role-list">
              {generalRoles.map(role => (
                <RoleItem
                  key={role.id}
                  role={role}
                  onToggle={() => handleToggleRole(role.id)}
                  onDelete={
                    role.id.startsWith('custom-')
                      ? () => handleDeleteRole(role.id)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>

          {/* Add New Role */}
          <div className="add-role-section">
            <h3>Add Custom Role</h3>
            <div className="add-role-form">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Role name"
              />
              <select
                value={newRoleType}
                onChange={(e) => setNewRoleType(e.target.value as 'ring' | 'general')}
              >
                <option value="ring">Ring Role</option>
                <option value="general">General Duty</option>
              </select>
              <button
                className="btn btn-secondary"
                onClick={handleAddRole}
                disabled={!newRoleName.trim()}
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface RoleItemProps {
  role: ScheduleRole;
  onToggle: () => void;
  onDelete?: () => void;
}

function RoleItem({ role, onToggle, onDelete }: RoleItemProps) {
  return (
    <div className={`role-item ${role.isActive ? '' : 'inactive'}`}>
      <div
        className="role-color-dot"
        style={{ backgroundColor: role.color }}
      />
      <span className="role-name">{role.name}</span>
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={role.isActive}
          onChange={onToggle}
        />
        <span className="toggle-slider" />
      </label>
      {onDelete && (
        <button className="role-delete-btn" onClick={onDelete} title="Delete">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function getRandomColor(): string {
  const colors = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
