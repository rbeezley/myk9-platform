/**
 * Schedule Board Component
 *
 * A class-based steward scheduling board with:
 * - Class assignments table (ring roles per class)
 * - General duties section (hospitality, equipment, etc.)
 * - Volunteer pool with drag-and-drop
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Users, Briefcase, ChevronDown, ChevronRight } from 'lucide-react';
import { useScheduleBoard } from '../hooks/useScheduleBoard';
import { useScheduleFiltering } from '../hooks/useScheduleFiltering';
import { VolunteerPool } from './VolunteerPool';
import { VolunteerChip } from './VolunteerChip';
import { VolunteerDialog } from './VolunteerDialog';
import { RoleConfigDialog } from './RoleConfigDialog';
import { ActiveFilterChip, FilterPanel } from '../../../components/ui';
import type { Volunteer, ClassInfo } from '../types';

interface ScheduleBoardProps {
  /** When true, disables all editing features (add, edit, delete, drag) */
  isReadOnly?: boolean;
  /** External trigger for actions (from header menu) */
  externalTrigger?: 'add-volunteer' | 'manage-roles' | null;
  /** Callback when trigger has been consumed */
  onTriggerConsumed?: () => void;
  /** Search term for filtering classes/volunteers */
  searchTerm?: string;
  /** Callback to set search term */
  onSearchChange?: (term: string) => void;
  /** Selected volunteer names for multi-select filtering */
  selectedVolunteers?: string[];
  /** Callback to update selected volunteers */
  onSelectedVolunteersChange?: (volunteers: string[]) => void;
  /** Selected judge names for multi-select filtering */
  selectedJudges?: string[];
  /** Callback to update selected judges */
  onSelectedJudgesChange?: (judges: string[]) => void;
  /** Callback to clear all filters */
  onClearAllFilters?: () => void;
  /** Whether the filter panel is open */
  isFilterOpen?: boolean;
  /** Callback to close the filter panel */
  onFilterClose?: () => void;
}

// Helper to format class name from components
function formatClassName(cls: ClassInfo): string {
  const parts = [cls.level];
  if (cls.section) parts.push(cls.section);
  parts.push(cls.element);
  return parts.join(' ');
}

// Helper to format trial identifier (e.g., "Saturday, September 16th, 2023, Trial 1")
function formatTrialId(cls: ClassInfo): string {
  if (!cls.trial_date) return '';

  const date = new Date(cls.trial_date + 'T00:00:00'); // Ensure consistent parsing
  const day = date.getDate();

  // Add ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear();
  const trialNum = cls.trial_number ? `, Trial ${cls.trial_number}` : '';

  return `${weekday}, ${month} ${ordinal(day)}, ${year}${trialNum}`;
}

// eslint-disable-next-line complexity -- Complex component with many features (drag-drop, filtering, dialogs)
export function ScheduleBoard({
  isReadOnly = false,
  externalTrigger,
  onTriggerConsumed,
  searchTerm = '',
  onSearchChange,
  selectedVolunteers = [],
  onSelectedVolunteersChange,
  selectedJudges = [],
  onSelectedJudgesChange,
  onClearAllFilters,
  isFilterOpen = false,
  onFilterClose
}: ScheduleBoardProps) {
  const {
    classes,
    roles,
    volunteers,
    classAssignments,
    generalAssignments,
    isLoading,
    addVolunteer,
    updateVolunteer,
    deleteVolunteer,
    assignToClass,
    removeFromClass,
    assignToGeneralDuty,
    removeFromGeneralDuty,
    updateRoles,
  } = useScheduleBoard();

  const [activeVolunteer, setActiveVolunteer] = useState<Volunteer | null>(null);
  const [volunteerDialogOpen, setVolunteerDialogOpen] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);
  const [roleConfigOpen, setRoleConfigOpen] = useState(false);
  const [generalDutiesExpanded, setGeneralDutiesExpanded] = useState(true);

  // Use filtering hook for volunteer/judge multi-select
  const { hasAnyFilter, filteredClasses, filteredGeneralRoles, uniqueJudges } = useScheduleFiltering({
    classes,
    roles,
    volunteers,
    classAssignments,
    generalAssignments,
    searchTerm,
    selectedVolunteers,
    selectedJudges,
  });

  // Handle external triggers from header menu - intentional setState in effect
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (externalTrigger === 'add-volunteer') {
      setEditingVolunteer(null);
      setVolunteerDialogOpen(true);
      onTriggerConsumed?.();
    } else if (externalTrigger === 'manage-roles') {
      setRoleConfigOpen(true);
      onTriggerConsumed?.();
    }
  }, [externalTrigger, onTriggerConsumed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Filter ring roles (always show all active ring roles - they're column headers)
  const ringRoles = useMemo(
    () => roles.filter(r => r.isRingRole && r.isActive),
    [roles]
  );

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    // Disable drag in read-only mode
    if (isReadOnly) return;

    const { active } = event;
    const volunteer = volunteers.find(v => v.id === active.id);
    if (volunteer) {
      setActiveVolunteer(volunteer);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    // Disable drop in read-only mode
    if (isReadOnly) {
      setActiveVolunteer(null);
      return;
    }

    const { active, over } = event;
    setActiveVolunteer(null);

    if (!over) return;

    const volunteerId = active.id as string;
    const dropTarget = over.id as string;

    // Parse drop target: format is "class-{classId}-role-{roleId}" for class assignments
    const classMatch = dropTarget.match(/^class-(\d+)-role-(.+)$/);
    if (classMatch) {
      const classId = parseInt(classMatch[1], 10);
      const roleId = classMatch[2];
      assignToClass(volunteerId, classId, roleId);
      return;
    }

    // Parse drop target: format is "general-role-{roleId}" for general duties
    const generalMatch = dropTarget.match(/^general-role-(.+)$/);
    if (generalMatch) {
      const roleId = generalMatch[1];
      assignToGeneralDuty(volunteerId, roleId);
    }
  };

  // Check if volunteer has conflict with a class
  const hasConflict = (volunteer: Volunteer, classId: number): boolean => {
    return volunteer.enteredClassIds.includes(classId);
  };

  // Get volunteers assigned to a specific class/role
  const getAssignedVolunteers = (classId: number, roleId: string): Volunteer[] => {
    const assignment = classAssignments.find(
      a => a.classId === classId && a.roleId === roleId
    );
    if (!assignment) return [];
    return assignment.volunteerIds
      .map(id => volunteers.find(v => v.id === id))
      .filter((v): v is Volunteer => v !== undefined);
  };

  // Get volunteers assigned to a specific general duty role
  const getGeneralDutyVolunteers = (roleId: string): Volunteer[] => {
    const assignment = generalAssignments.find(a => a.roleId === roleId);
    if (!assignment) return [];
    return assignment.volunteerIds
      .map(id => volunteers.find(v => v.id === id))
      .filter((v): v is Volunteer => v !== undefined);
  };

  // Format planned start time
  const formatTime = (timestamp?: string) => {
    if (!timestamp) return 'TBD';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (isLoading) {
    return (
      <div className="schedule-container">
        <div className="empty-state">
          <p>Loading class data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`schedule-container ${isReadOnly ? 'schedule-readonly' : ''}`}>
      <DndContext
        sensors={isReadOnly ? [] : sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Volunteer Pool - Sticky at top */}
        <div className="volunteer-pool-sticky">
          <VolunteerPool
            volunteers={volunteers}
            isReadOnly={isReadOnly}
            onAddVolunteer={isReadOnly ? undefined : () => {
              setEditingVolunteer(null);
              setVolunteerDialogOpen(true);
            }}
            onEditVolunteer={isReadOnly ? undefined : (volunteer) => {
              setEditingVolunteer(volunteer);
              setVolunteerDialogOpen(true);
            }}
            onDeleteVolunteer={isReadOnly ? undefined : deleteVolunteer}
          />
        </div>

        {/* Active Filter Chip - shows when any filter is active */}
        {hasAnyFilter && (
          <div className="schedule-filter-chip-container">
            <ActiveFilterChip
              searchTerm={
                // Build a descriptive filter string
                [
                  searchTerm ? `"${searchTerm}"` : '',
                  selectedVolunteers.length > 0 ? selectedVolunteers.join(', ') : '',
                  selectedJudges.length > 0 ? `Judge: ${selectedJudges.join(', ')}` : ''
                ].filter(Boolean).join(' + ')
              }
              matchCount={filteredClasses.length + filteredGeneralRoles.length}
              totalCount={classes.length + roles.filter(r => !r.isRingRole && r.isActive).length}
              onClear={onClearAllFilters || (() => {})}
            />
          </div>
        )}

        {/* Scrollable content area */}
        <div className="schedule-scrollable-content">
          {/* General Duties Section */}
          <div className={`schedule-table-wrapper general-duties-wrapper ${!generalDutiesExpanded ? 'collapsed' : ''}`}>
            <button
              className="schedule-section-header schedule-section-header-collapsible"
              onClick={() => setGeneralDutiesExpanded(!generalDutiesExpanded)}
              aria-expanded={generalDutiesExpanded}
            >
              {generalDutiesExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <Briefcase size={18} />
              <span>General Duties</span>
            </button>

            {!generalDutiesExpanded ? null : filteredGeneralRoles.length === 0 ? (
              <div className="empty-state">
                <p>{hasAnyFilter ? 'No matching general duties found.' : 'No general duty roles configured. Go to Manage Roles to add some.'}</p>
              </div>
            ) : (
              <table className="general-duties-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Assigned Volunteers</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGeneralRoles.map(role => {
                    const assigned = getGeneralDutyVolunteers(role.id);
                    return (
                      <tr key={role.id} className="general-duty-row">
                        <td className="general-duty-role-name">
                          <span
                            className="role-color-dot"
                            style={{ backgroundColor: role.color }}
                          />
                          {role.name}
                        </td>
                        <td>
                          <DroppableCell
                            id={`general-role-${role.id}`}
                            classId={0}
                            roleId={role.id}
                          >
                            {assigned.map(volunteer => (
                              <VolunteerChip
                                key={volunteer.id}
                                volunteer={volunteer}
                                onRemove={isReadOnly ? undefined : () => removeFromGeneralDuty(volunteer.id, role.id)}
                              />
                            ))}
                          </DroppableCell>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Class Assignments Table */}
          <div className="schedule-table-wrapper">
            <div className="schedule-section-header">
              <Users size={18} />
              <span>Class Assignments</span>
            </div>

            {filteredClasses.length === 0 ? (
              <div className="empty-state">
                <p>{hasAnyFilter ? 'No matching classes found.' : 'No classes found for this trial.'}</p>
              </div>
            ) : (
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Judge</th>
                    {ringRoles.map(role => (
                      <th key={role.id}>{role.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.map(cls => (
                    <tr key={cls.id}>
                      <td>
                        <div className="schedule-class-info">
                          <span className="schedule-class-name">{formatClassName(cls)}</span>
                          <span className="schedule-class-meta">
                            <span className="schedule-trial-id">{formatTrialId(cls)}</span>
                            {cls.planned_start_time && (
                              <span className="schedule-class-time">{formatTime(cls.planned_start_time)}</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>{cls.judge_name}</td>
                      {ringRoles.map(role => {
                        const assigned = getAssignedVolunteers(cls.id, role.id);
                        return (
                          <td key={role.id}>
                            <DroppableCell
                              id={`class-${cls.id}-role-${role.id}`}
                              classId={cls.id}
                              roleId={role.id}
                            >
                              {assigned.map(volunteer => (
                                <VolunteerChip
                                  key={volunteer.id}
                                  volunteer={volunteer}
                                  hasConflict={hasConflict(volunteer, cls.id)}
                                  onRemove={isReadOnly ? undefined : () => removeFromClass(volunteer.id, cls.id, role.id)}
                                />
                              ))}
                            </DroppableCell>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DragOverlay modifiers={[snapCenterToCursor]}>
          {activeVolunteer ? (
            <VolunteerChip volunteer={activeVolunteer} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Dialogs */}
      <VolunteerDialog
        isOpen={volunteerDialogOpen}
        onClose={() => {
          setVolunteerDialogOpen(false);
          setEditingVolunteer(null);
        }}
        onSave={(data) => {
          if (editingVolunteer) {
            updateVolunteer(editingVolunteer.id, data);
          } else {
            addVolunteer(data);
          }
          setVolunteerDialogOpen(false);
          setEditingVolunteer(null);
        }}
        volunteer={editingVolunteer}
      />

      <RoleConfigDialog
        isOpen={roleConfigOpen}
        onClose={() => setRoleConfigOpen(false)}
        roles={roles}
        onSave={updateRoles}
      />

      {/* Search/Filter Panel with multi-select chips */}
      <FilterPanel
        isOpen={isFilterOpen}
        onClose={onFilterClose || (() => {})}
        searchTerm={searchTerm}
        onSearchChange={onSearchChange || (() => {})}
        searchPlaceholder="Type to search..."
        sortOptions={[]}
        sortOrder=""
        onSortChange={() => {}}
        title="Find Assignments"
      >
        {/* Quick-pick: Volunteers (multi-select) */}
        {volunteers.length > 0 && (
          <div className="filter-quick-pick-section">
            <label className="filter-quick-pick-label">
              Volunteers {selectedVolunteers.length > 0 && `(${selectedVolunteers.length} selected)`}
            </label>
            <div className="filter-quick-pick-chips">
              {volunteers.map(v => {
                const isSelected = selectedVolunteers.includes(v.name);
                return (
                  <button
                    key={v.id}
                    className={`filter-quick-pick-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      if (isSelected) {
                        onSelectedVolunteersChange?.(selectedVolunteers.filter(sv => sv !== v.name));
                      } else {
                        onSelectedVolunteersChange?.([...selectedVolunteers, v.name]);
                      }
                    }}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick-pick: Judges (multi-select) */}
        {uniqueJudges.length > 0 && (
          <div className="filter-quick-pick-section">
            <label className="filter-quick-pick-label">
              Judges {selectedJudges.length > 0 && `(${selectedJudges.length} selected)`}
            </label>
            <div className="filter-quick-pick-chips">
              {uniqueJudges.map(judge => {
                const isSelected = selectedJudges.includes(judge);
                return (
                  <button
                    key={judge}
                    className={`filter-quick-pick-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      if (isSelected) {
                        onSelectedJudgesChange?.(selectedJudges.filter(sj => sj !== judge));
                      } else {
                        onSelectedJudgesChange?.([...selectedJudges, judge]);
                      }
                    }}
                  >
                    {judge}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Done button */}
        <div className="filter-panel-actions">
          <button
            className="filter-panel-done-btn"
            onClick={onFilterClose}
          >
            Done
          </button>
        </div>
      </FilterPanel>
    </div>
  );
}

// Droppable Cell Component
import { useDroppable } from '@dnd-kit/core';

interface DroppableCellProps {
  id: string;
  classId: number;
  roleId: string;
  children: React.ReactNode;
}

function DroppableCell({ id, children }: DroppableCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`schedule-role-cell ${isOver ? 'drop-target' : ''}`}
    >
      {children}
    </div>
  );
}
