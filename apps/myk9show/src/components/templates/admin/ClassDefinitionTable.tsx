import React, { useState, useMemo } from 'react';
import { ClassDefinition } from '@/types/template.types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Edit,
  Copy,
  Trash2,
  GripVertical,
  Plus,
  Check,
  X
} from 'lucide-react';

interface ClassDefinitionTableProps {
  classes: ClassDefinition[];
  onChange: (classes: ClassDefinition[]) => void;
  onEdit: (index: number) => void;
  readOnly?: boolean;
}

type SortField = 'displayOrder' | 'element' | 'level' | 'section';
type SortDirection = 'asc' | 'desc';

// Extracted SortIcon component
interface SortIconProps {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}

const SortIcon = ({ field, sortField, sortDirection }: SortIconProps) => {
  if (sortField !== field) {
    return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
  }
  return sortDirection === 'asc'
    ? <ArrowUp className="h-4 w-4" />
    : <ArrowDown className="h-4 w-4" />;
};

export const ClassDefinitionTable: React.FC<ClassDefinitionTableProps> = ({
  classes,
  onChange,
  onEdit,
  readOnly = false
}) => {
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<SortField>('displayOrder');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingDisplayOrder, setEditingDisplayOrder] = useState<{
    index: number;
    value: string;
  } | null>(null);

  // Sort classes
  const sortedClasses = useMemo(() => {
    const sorted = [...classes].sort((a, b) => {
      let aValue: unknown = a[sortField];
      let bValue: unknown = b[sortField];

      // Handle null/undefined values
      if (aValue == null) aValue = '';
      if (bValue == null) bValue = '';

      // Convert to strings for comparison
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();

      if (sortField === 'displayOrder') {
        aValue = Number(a.displayOrder);
        bValue = Number(b.displayOrder);
      }

      if (String(aValue) < String(bValue)) return sortDirection === 'asc' ? -1 : 1;
      if (String(aValue) > String(bValue)) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [classes, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(classes.map((_, index) => index)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (index: number, checked: boolean) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(index);
    } else {
      newSelected.delete(index);
    }
    setSelectedRows(newSelected);
  };

  const handleDuplicate = (index: number) => {
    const classToDuplicate = classes[index];
    const newClass: ClassDefinition = {
      ...classToDuplicate,
      className: `${classToDuplicate.className} (Copy)`,
      displayOrder: classes.length + 1
    };
    onChange([...classes, newClass]);
  };

  const handleDelete = (index: number) => {
    const newClasses = classes.filter((_, i) => i !== index);
    // Reorder display orders
    const reordered = newClasses.map((cls, i) => ({
      ...cls,
      displayOrder: i + 1
    }));
    onChange(reordered);
  };

  const handleBulkDelete = () => {
    const newClasses = classes.filter((_, index) => !selectedRows.has(index));
    // Reorder display orders
    const reordered = newClasses.map((cls, i) => ({
      ...cls,
      displayOrder: i + 1
    }));
    onChange(reordered);
    setSelectedRows(new Set());
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newClasses = [...classes];
    const draggedClass = newClasses[draggedIndex];
    
    // Remove from old position
    newClasses.splice(draggedIndex, 1);
    
    // Insert at new position
    newClasses.splice(dropIndex, 0, draggedClass);
    
    // Update display orders
    const reordered = newClasses.map((cls, i) => ({
      ...cls,
      displayOrder: i + 1
    }));
    
    onChange(reordered);
    setDraggedIndex(null);
  };

  const handleDisplayOrderEdit = (index: number) => {
    setEditingDisplayOrder({
      index,
      value: String(classes[index].displayOrder)
    });
  };

  const saveDisplayOrder = () => {
    if (!editingDisplayOrder) return;
    
    const newOrder = parseInt(editingDisplayOrder.value);
    if (isNaN(newOrder) || newOrder < 1) {
      setEditingDisplayOrder(null);
      return;
    }

    const newClasses = [...classes];
    const movedClass = newClasses[editingDisplayOrder.index];
    
    // Update the display order
    movedClass.displayOrder = newOrder;
    
    // Reorder array based on display orders
    newClasses.sort((a, b) => a.displayOrder - b.displayOrder);
    
    // Normalize display orders
    const normalized = newClasses.map((cls, i) => ({
      ...cls,
      displayOrder: i + 1
    }));
    
    onChange(normalized);
    setEditingDisplayOrder(null);
  };

  return (
    <div className="space-y-3">
      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Define the specific classes that will be generated from this template. Drag rows to reorder or click on the display order to edit.
      </p>

      {/* Controls bar - always visible */}
      {!readOnly && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg min-h-[40px]">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {selectedRows.size > 0 
                ? `${selectedRows.size} class${selectedRows.size !== 1 ? 'es' : ''} selected`
                : 'No classes selected'
              }
            </span>
            {selectedRows.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => {
              const element = 'Container';
              const level = 'Novice';
              const section = 'A';
              const newClass: ClassDefinition = {
                element,
                level,
                section,
                className: `${element} ${level} ${section}`.trim(),
                displayOrder: classes.length + 1,
                description: '',
                fieldOverrides: {}
              };
              onChange([...classes, newClass]);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Class
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {!readOnly && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedRows.size === classes.length && classes.length > 0}
                    onCheckedChange={handleSelectAll}
                    {...(selectedRows.size > 0 && selectedRows.size < classes.length 
                      ? { 'data-state': 'indeterminate' } 
                      : {})}
                  />
                </TableHead>
              )}
              {!readOnly && (
                <TableHead className="w-12">
                  {/* Drag handle column */}
                </TableHead>
              )}
              <TableHead className="w-20">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 p-0"
                  onClick={() => handleSort('displayOrder')}
                >
                  Order
                  <SortIcon field="displayOrder" sortField={sortField} sortDirection={sortDirection} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 p-0"
                  onClick={() => handleSort('element')}
                >
                  Element
                  <SortIcon field="element" sortField={sortField} sortDirection={sortDirection} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 p-0"
                  onClick={() => handleSort('level')}
                >
                  Level
                  <SortIcon field="level" sortField={sortField} sortDirection={sortDirection} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 p-0"
                  onClick={() => handleSort('section')}
                >
                  Section
                  <SortIcon field="section" sortField={sortField} sortDirection={sortDirection} />
                </Button>
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedClasses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 5 : 8} className="text-center py-8">
                  <div className="text-muted-foreground">
                    No classes defined yet.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedClasses.map((classDef, sortedIndex) => {
                // Find original index for operations
                const originalIndex = classes.findIndex(c => c === classDef);
                const isSelected = selectedRows.has(originalIndex);
                
                return (
                  <TableRow
                    key={originalIndex}
                    draggable={!readOnly}
                    onDragStart={() => handleDragStart(originalIndex)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, sortedIndex)}
                    className={`${isSelected ? 'bg-muted/50' : ''} ${
                      draggedIndex === originalIndex ? 'opacity-50' : ''
                    }`}
                  >
                    {!readOnly && (
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => 
                            handleSelectRow(originalIndex, checked as boolean)
                          }
                        />
                      </TableCell>
                    )}
                    {!readOnly && (
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                      </TableCell>
                    )}
                    <TableCell>
                      {editingDisplayOrder?.index === originalIndex ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={editingDisplayOrder.value}
                            onChange={(e) => setEditingDisplayOrder({
                              ...editingDisplayOrder,
                              value: e.target.value
                            })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveDisplayOrder();
                              if (e.key === 'Escape') setEditingDisplayOrder(null);
                            }}
                            className="h-7 w-16"
                            min="1"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={saveDisplayOrder}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditingDisplayOrder(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span 
                          className="cursor-pointer hover:text-primary"
                          onClick={() => !readOnly && handleDisplayOrderEdit(originalIndex)}
                        >
                          {classDef.displayOrder}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{classDef.element}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{classDef.level}</Badge>
                    </TableCell>
                    <TableCell>
                      {classDef.section && (
                        <Badge variant="outline">{classDef.section}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {classDef.description || '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(originalIndex)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {!readOnly && (
                            <>
                              <DropdownMenuItem onClick={() => handleDuplicate(originalIndex)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDelete(originalIndex)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};