import React, { useState, useMemo, useEffect } from 'react';
import { ClassTemplate, ClassDefinition } from '@/types/template.types';
import { ShowJudgeAssignment } from '@/types/judge-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { logger } from '@/services/LoggingService';
import { Search, CheckSquare, Square, Filter, User } from 'lucide-react';
import '@/styles/myk9-class-selection.css';

interface SimpleClassSelectorProps {
  template: ClassTemplate;
  selectedClasses: ClassDefinition[];
  onSelectionChange: (classes: ClassDefinition[]) => void;
  existingClasses?: { className?: string; element: string; level: string; section: string }[]; // Classes already in trial to show as disabled
  availableJudges?: ShowJudgeAssignment[];
  judgeAssignments?: Record<string, string>; // classId -> judgeId
  onJudgeAssignmentChange?: (assignments: Record<string, string>) => void;
}

export const SimpleClassSelector: React.FC<SimpleClassSelectorProps> = ({
  template,
  selectedClasses,
  onSelectionChange,
  existingClasses = [],
  availableJudges = [],
  judgeAssignments = {},
  onJudgeAssignmentChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterElement, setFilterElement] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [elementJudges, setElementJudges] = useState<Record<string, string>>({});

  const classes = useMemo(() => template.classDefinitions || [], [template.classDefinitions]);

  // Sync element-level judge dropdown when judgeAssignments change externally (e.g. auto-assign).
  // If every class in an element group shares the same judge, reflect that in the group dropdown.
  useEffect(() => {
    const elements = Array.from(new Set(classes.map(c => c.element)));
    const derived: Record<string, string> = {};
    elements.forEach(element => {
      const elementClasses = classes.filter(c => c.element === element);
      const assignedJudges = elementClasses
        .map(c => judgeAssignments[c.className])
        .filter(Boolean);
      if (assignedJudges.length === elementClasses.length) {
        const allSame = assignedJudges.every(j => j === assignedJudges[0]);
        if (allSame) derived[element] = assignedJudges[0];
      }
    });
    setElementJudges(prev => ({ ...prev, ...derived }));
  }, [judgeAssignments, classes]);

  // Get unique elements and levels for filters
  const elements = useMemo(() => {
    const uniqueElements = Array.from(new Set(classes.map(c => c.element)));
    return uniqueElements.sort();
  }, [classes]);

  const levels = useMemo(() => {
    const uniqueLevels = Array.from(
      new Set(classes.map(c => c.level).filter((level): level is string => Boolean(level)))
    );
    return uniqueLevels.sort();
  }, [classes]);

  // Filter classes
  const filteredClasses = useMemo(() => {
    return classes.filter(cls => {
      const matchesSearch =
        !searchTerm || cls.className.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesElement = filterElement === 'all' || cls.element === filterElement;
      const matchesLevel = filterLevel === 'all' || cls.level === filterLevel;

      return matchesSearch && matchesElement && matchesLevel;
    });
  }, [classes, searchTerm, filterElement, filterLevel]);

  // Group classes by element for 5-column layout
  const classesByElement = useMemo(() => {
    const grouped: Record<string, ClassDefinition[]> = {};

    logger.debug('Grouping classes - filteredClasses:', 'templates', { data: filteredClasses });

    filteredClasses.forEach(cls => {
      if (!grouped[cls.element]) {
        grouped[cls.element] = [];
      }
      grouped[cls.element].push(cls);
    });

    // Sort each element's classes by level order
    Object.keys(grouped).forEach(element => {
      grouped[element].sort((a, b) => {
        const levelOrder = ['Novice', 'Advanced', 'Excellent', 'Master'];
        const aIndex = levelOrder.indexOf(a.level || '');
        const bIndex = levelOrder.indexOf(b.level || '');

        if (aIndex !== bIndex) return aIndex - bIndex;

        // If same level, sort by section (A before B)
        return (a.section || '').localeCompare(b.section || '');
      });
    });

    logger.debug('Grouped classes:', 'templates', { data: grouped });
    return grouped;
  }, [filteredClasses]);

  // Check if a class is selected
  const isClassSelected = (classDefinition: ClassDefinition) => {
    return selectedClasses.some(
      selected =>
        selected.className === classDefinition.className &&
        selected.element === classDefinition.element &&
        selected.level === classDefinition.level &&
        selected.section === classDefinition.section
    );
  };

  // Check if a class already exists in the trial.
  // Prefer className match (reliable), fall back to element+level+section.
  const isClassExisting = (classDefinition: ClassDefinition) => {
    return existingClasses.some(
      existing =>
        (existing.className && existing.className === classDefinition.className) ||
        (existing.element === classDefinition.element &&
          existing.level === (classDefinition.level || '') &&
          existing.section === (classDefinition.section || ''))
    );
  };

  // Toggle class selection
  const toggleClassSelection = (classDefinition: ClassDefinition) => {
    // Don't allow selection of existing classes
    if (isClassExisting(classDefinition)) {
      return;
    }

    if (isClassSelected(classDefinition)) {
      const updated = selectedClasses.filter(
        selected =>
          !(
            selected.className === classDefinition.className &&
            selected.element === classDefinition.element &&
            selected.level === classDefinition.level &&
            selected.section === classDefinition.section
          )
      );
      onSelectionChange(updated);
    } else {
      onSelectionChange([...selectedClasses, classDefinition]);
    }
  };

  // Bulk actions
  const selectAll = () => {
    // Only select classes that don't already exist
    const selectableClasses = filteredClasses.filter(cls => !isClassExisting(cls));
    onSelectionChange([...selectableClasses]);
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  // Count only selectable classes for bulk action state
  const selectableClasses = filteredClasses.filter(cls => !isClassExisting(cls));
  const allSelected =
    selectableClasses.length > 0 && selectableClasses.every(cls => isClassSelected(cls));

  // Judge assignment helpers
  const handleElementJudgeChange = (element: string, judgeId: string) => {
    if (!onJudgeAssignmentChange) return;

    // Convert "no-judge" to empty assignment
    const actualJudgeId = judgeId === 'no-judge' ? '' : judgeId;

    // Update element judge state
    setElementJudges(prev => ({ ...prev, [element]: judgeId }));

    // Apply to all classes in this element
    const elementClasses = filteredClasses.filter(cls => cls.element === element);
    const newAssignments = { ...judgeAssignments };

    elementClasses.forEach(cls => {
      if (actualJudgeId) {
        newAssignments[cls.className] = actualJudgeId;
      } else {
        delete newAssignments[cls.className];
      }
    });

    onJudgeAssignmentChange(newAssignments);
  };

  const handleClassJudgeChange = (classId: string, judgeId: string) => {
    if (!onJudgeAssignmentChange) return;

    // Convert "no-judge" to empty assignment
    const actualJudgeId = judgeId === 'no-judge' ? '' : judgeId;

    const newAssignments = { ...judgeAssignments };
    if (actualJudgeId) {
      newAssignments[classId] = actualJudgeId;
    } else {
      delete newAssignments[classId];
    }

    onJudgeAssignmentChange(newAssignments);
  };

  const getJudgeForClass = (classId: string) => {
    const judgeId = judgeAssignments[classId];
    return availableJudges.find(j => j.judgeId === judgeId);
  };

  const getJudgeDisplayName = (judgeId: string | undefined) => {
    if (!judgeId || judgeId === 'no-judge') return 'No Judge';
    const judge = availableJudges.find(j => j.judgeId === judgeId);
    return judge?.judgeName || 'Unknown Judge';
  };

  return (
    <div className="myk9-class-selector w-full">
      {/* Streamlined Filters and Search */}
      <div className="myk9-class-filters">
        <div className="myk9-class-filters-row">
          {/* Search with Selection Count */}
          <div className="myk9-class-search">
            <div className="myk9-class-search-wrapper relative">
              <Search className="myk9-class-search-icon" />
              <input
                type="text"
                placeholder="Search classes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="myk9-class-search-input pr-20"
              />
              {selectedClasses.length > 0 && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full font-medium">
                  {selectedClasses.length} selected
                </div>
              )}
            </div>
          </div>

          {/* Element Filter */}
          <div className="myk9-class-filter-select">
            <Select value={filterElement} onValueChange={setFilterElement}>
              <SelectTrigger className="select-trigger">
                <SelectValue placeholder="Element" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Elements</SelectItem>
                {elements.map(element => (
                  <SelectItem key={element} value={element}>
                    {element}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Level Filter */}
          <div className="myk9-class-filter-select">
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="select-trigger">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {levels.map(level => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bulk Actions */}
          <div className="myk9-class-bulk-actions">
            <button
              type="button"
              onClick={allSelected ? clearAll : selectAll}
              className="myk9-class-bulk-button"
            >
              {allSelected ? (
                <>
                  <Square className="h-4 w-4" />
                  Clear All
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Select All
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Classes by Element - Premium design */}
      <div className="space-y-5">
        {Object.keys(classesByElement).length > 0 ? (
          Object.entries(classesByElement).map(([element, elementClasses]) => {
            // Check if all selectable classes in this element are selected
            const selectableElementClasses = elementClasses.filter(cls => !isClassExisting(cls));
            const allElementClassesSelected =
              selectableElementClasses.length > 0 &&
              selectableElementClasses.every(cls => isClassSelected(cls));
            const someElementClassesSelected = selectableElementClasses.some(cls =>
              isClassSelected(cls)
            );

            const toggleAllElementClasses = () => {
              if (allElementClassesSelected) {
                // Deselect all classes in this element
                const updatedSelected = selectedClasses.filter(
                  selected =>
                    !elementClasses.some(
                      elementClass =>
                        selected.className === elementClass.className &&
                        selected.element === elementClass.element &&
                        selected.level === elementClass.level &&
                        selected.section === elementClass.section
                    )
                );
                onSelectionChange(updatedSelected);
              } else {
                // Select all selectable classes in this element (exclude existing ones)
                const elementClassesToAdd = elementClasses.filter(
                  cls => !isClassSelected(cls) && !isClassExisting(cls)
                );
                onSelectionChange([...selectedClasses, ...elementClassesToAdd]);
              }
            };

            const handleElementCheckboxClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              toggleAllElementClasses();
            };

            return (
              <div key={element} className="myk9-class-element-section">
                {/* Element Header */}
                <div className="myk9-class-element-header">
                  <div className="myk9-class-element-info flex-wrap">
                    <div
                      className={`myk9-class-element-checkbox ${
                        allElementClassesSelected
                          ? 'checked'
                          : someElementClassesSelected
                            ? 'indeterminate'
                            : ''
                      }`}
                      onClick={handleElementCheckboxClick}
                      role="checkbox"
                      aria-checked={allElementClassesSelected}
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleAllElementClasses();
                        }
                      }}
                    />
                    <h3 className="myk9-class-element-title" onClick={toggleAllElementClasses}>
                      {element}
                    </h3>
                    <div className="myk9-class-element-count">{elementClasses.length} classes</div>

                    {/* Judge Assignment for Element - moved here */}
                    {availableJudges.length > 0 && (
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <Select
                          value={elementJudges[element] || 'no-judge'}
                          onValueChange={judgeId => handleElementJudgeChange(element, judgeId)}
                        >
                          <SelectTrigger className="w-48 h-6 text-[10px] border-muted">
                            <SelectValue>{getJudgeDisplayName(elementJudges[element])}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no-judge">No Judge</SelectItem>
                            {availableJudges.map(judge => (
                              <SelectItem key={judge.judgeId} value={judge.judgeId}>
                                {judge.judgeName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <span className="myk9-class-element-select-all" onClick={toggleAllElementClasses}>
                    Select All {element}
                  </span>
                </div>

                {/* Classes Grid - Use fewer columns when judges are being assigned */}
                <div
                  className={`myk9-class-cards-grid ${availableJudges.length > 0 ? 'judge-mode' : ''}`}
                >
                  {elementClasses.map((classDefinition, index) => {
                    const isSelected = isClassSelected(classDefinition);
                    const isExisting = isClassExisting(classDefinition);

                    const handleCardClick = () => {
                      if (!isExisting) {
                        toggleClassSelection(classDefinition);
                      }
                    };

                    const handleCheckboxClick = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (!isExisting) {
                        toggleClassSelection(classDefinition);
                      }
                    };

                    return (
                      <div
                        key={`${element}-${classDefinition.level}-${classDefinition.section}-${index}`}
                        className={`myk9-class-card ${isSelected ? 'selected' : ''} ${isExisting ? 'existing' : ''}`}
                        onClick={handleCardClick}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-disabled={isExisting}
                        tabIndex={isExisting ? -1 : 0}
                        onKeyDown={e => {
                          if (!isExisting && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            toggleClassSelection(classDefinition);
                          }
                        }}
                      >
                        {/* Checkbox */}
                        <div
                          className={`myk9-class-card-checkbox ${isExisting ? 'disabled' : ''}`}
                          onClick={handleCheckboxClick}
                        />

                        {/* Class content */}
                        <div className="myk9-class-card-content">
                          <div className={`myk9-class-card-level ${isExisting ? 'disabled' : ''}`}>
                            {classDefinition.level || element}
                            {classDefinition.section && (
                              <span
                                className={`myk9-class-card-section-inline ${isExisting ? 'disabled' : ''}`}
                              >
                                {classDefinition.section}
                              </span>
                            )}
                          </div>

                          {/* Judge Assignment for Individual Class - Compact Display */}
                          {judgeAssignments[classDefinition.className] && !isExisting && (
                            <div className="mt-1 text-[9px] text-muted-foreground flex items-center gap-1">
                              <User className="h-2.5 w-2.5" />
                              <span className="truncate">
                                {getJudgeForClass(classDefinition.className)?.judgeName ||
                                  'Unknown Judge'}
                              </span>
                            </div>
                          )}

                          {/* Judge Selection Dropdown - Only for selected classes */}
                          {isSelected && availableJudges.length > 0 && !isExisting && (
                            <div className="mt-1" onClick={e => e.stopPropagation()}>
                              <Select
                                value={judgeAssignments[classDefinition.className] || 'no-judge'}
                                onValueChange={judgeId =>
                                  handleClassJudgeChange(classDefinition.className, judgeId)
                                }
                              >
                                <SelectTrigger className="w-full h-5 text-[9px] border-muted">
                                  <SelectValue className="truncate">
                                    {getJudgeDisplayName(
                                      judgeAssignments[classDefinition.className]
                                    )}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="no-judge">No Judge</SelectItem>
                                  {availableJudges.map(judge => (
                                    <SelectItem key={judge.judgeId} value={judge.judgeId}>
                                      {judge.judgeName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {isExisting && (
                            <div className="myk9-class-card-existing-badge">Already in trial</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="myk9-class-empty-state">
            <Filter className="myk9-class-empty-icon" />
            <h3 className="myk9-class-empty-title">No Classes Found</h3>
            <p className="myk9-class-empty-description">
              {searchTerm || filterElement !== 'all' || filterLevel !== 'all'
                ? 'No classes match your current filters.'
                : "This template doesn't have any classes defined."}
            </p>
            {(searchTerm || filterElement !== 'all' || filterLevel !== 'all') && (
              <button
                type="button"
                className="myk9-class-clear-filters"
                onClick={() => {
                  setSearchTerm('');
                  setFilterElement('all');
                  setFilterLevel('all');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleClassSelector;
