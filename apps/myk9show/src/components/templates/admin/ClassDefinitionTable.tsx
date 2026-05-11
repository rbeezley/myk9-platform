import React, { useState, useMemo, useCallback } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { ClassDefinition } from '@/types/template.types';
import { DataTable, DataTableToolbar, DataTableColumnToggle } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Copy, Trash2, GripVertical, Plus, Check, X } from 'lucide-react';

interface ClassDefinitionTableProps {
  classes: ClassDefinition[];
  onChange: (classes: ClassDefinition[]) => void;
  onEdit: (index: number) => void;
  readOnly?: boolean;
}

/** Row data with stable original index for operations that mutate the source array. */
interface ClassDefRow {
  classDef: ClassDefinition;
  originalIndex: number;
}

function buildColumns(
  readOnly: boolean,
  editingDisplayOrder: { index: number; value: string } | null,
  setEditingDisplayOrder: React.Dispatch<
    React.SetStateAction<{ index: number; value: string } | null>
  >,
  saveDisplayOrder: () => void,
  onEdit: (index: number) => void,
  handleDuplicate: (index: number) => void,
  handleDelete: (index: number) => void
): ColumnDef<ClassDefRow, unknown>[] {
  const cols: ColumnDef<ClassDefRow, unknown>[] = [];

  // Drag handle column (visual indicator only -- drag-to-reorder not supported via DataTable)
  if (!readOnly) {
    cols.push({
      id: '_drag',
      enableSorting: false,
      header: () => null,
      cell: () => <GripVertical className="h-4 w-4 text-muted-foreground opacity-40" />,
    });
  }

  // Display order (sortable, inline editable)
  cols.push({
    id: 'displayOrder',
    header: 'Order',
    accessorFn: (row: ClassDefRow) => row.classDef.displayOrder,
    sortingFn: 'basic',
    cell: ({ row }) => {
      const { classDef, originalIndex } = row.original;
      if (editingDisplayOrder?.index === originalIndex) {
        return (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={editingDisplayOrder.value}
              onChange={e =>
                setEditingDisplayOrder({
                  ...editingDisplayOrder,
                  value: e.target.value,
                })
              }
              onKeyDown={e => {
                if (e.key === 'Enter') saveDisplayOrder();
                if (e.key === 'Escape') setEditingDisplayOrder(null);
              }}
              className="h-7 w-16"
              min="1"
            />
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveDisplayOrder}>
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
        );
      }
      return (
        <span
          className={readOnly ? '' : 'cursor-pointer hover:text-primary'}
          onClick={() => {
            if (!readOnly) {
              setEditingDisplayOrder({
                index: originalIndex,
                value: String(classDef.displayOrder),
              });
            }
          }}
        >
          {classDef.displayOrder}
        </span>
      );
    },
  });

  // Element
  cols.push({
    id: 'element',
    header: 'Element',
    accessorFn: (row: ClassDefRow) => row.classDef.element,
    cell: ({ row }) => <Badge variant="outline">{row.original.classDef.element}</Badge>,
  });

  // Level
  cols.push({
    id: 'level',
    header: 'Level',
    accessorFn: (row: ClassDefRow) => row.classDef.level ?? '',
    cell: ({ row }) => <Badge variant="outline">{row.original.classDef.level}</Badge>,
  });

  // Section
  cols.push({
    id: 'section',
    header: 'Section',
    accessorFn: (row: ClassDefRow) => row.classDef.section ?? '',
    cell: ({ row }) => {
      const section = row.original.classDef.section;
      return section ? <Badge variant="outline">{section}</Badge> : null;
    },
  });

  // Description
  cols.push({
    id: 'description',
    header: 'Description',
    accessorFn: (row: ClassDefRow) => row.classDef.description ?? '',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.classDef.description || '-'}
      </span>
    ),
  });

  // Actions
  cols.push({
    id: '_actions',
    header: 'Actions',
    enableSorting: false,
    cell: ({ row }) => {
      const { originalIndex } = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
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
      );
    },
  });

  return cols;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ClassDefinitionTable: React.FC<ClassDefinitionTableProps> = ({
  classes,
  onChange,
  onEdit,
  readOnly = false,
}) => {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [editingDisplayOrder, setEditingDisplayOrder] = useState<{
    index: number;
    value: string;
  } | null>(null);

  // Wrap each ClassDefinition with its stable original index
  const rows: ClassDefRow[] = useMemo(
    () =>
      classes.map((classDef, index) => ({
        classDef,
        originalIndex: index,
      })),
    [classes]
  );

  // Row identity: use the original index as the row ID
  const getRowId = useCallback((row: ClassDefRow) => String(row.originalIndex), []);

  // Track selection via DataTable's onSelectionChange
  const handleSelectionChange = useCallback((selected: ClassDefRow[]) => {
    setSelectedIndices(new Set(selected.map(r => r.originalIndex)));
  }, []);

  const handleDuplicate = useCallback(
    (index: number) => {
      const classToDuplicate = classes[index];
      const newClass: ClassDefinition = {
        ...classToDuplicate,
        className: `${classToDuplicate.className} (Copy)`,
        displayOrder: classes.length + 1,
      };
      onChange([...classes, newClass]);
    },
    [classes, onChange]
  );

  const handleDelete = useCallback(
    (index: number) => {
      const newClasses = classes.filter((_, i) => i !== index);
      const reordered = newClasses.map((cls, i) => ({
        ...cls,
        displayOrder: i + 1,
      }));
      onChange(reordered);
    },
    [classes, onChange]
  );

  const handleBulkDelete = useCallback(() => {
    const newClasses = classes.filter((_, index) => !selectedIndices.has(index));
    const reordered = newClasses.map((cls, i) => ({
      ...cls,
      displayOrder: i + 1,
    }));
    onChange(reordered);
    setSelectedIndices(new Set());
  }, [classes, selectedIndices, onChange]);

  const saveDisplayOrder = useCallback(() => {
    if (!editingDisplayOrder) return;

    const newOrder = parseInt(editingDisplayOrder.value);
    if (isNaN(newOrder) || newOrder < 1) {
      setEditingDisplayOrder(null);
      return;
    }

    const newClasses = [...classes];
    const movedClass = newClasses[editingDisplayOrder.index];
    movedClass.displayOrder = newOrder;

    newClasses.sort((a, b) => a.displayOrder - b.displayOrder);
    const normalized = newClasses.map((cls, i) => ({
      ...cls,
      displayOrder: i + 1,
    }));

    onChange(normalized);
    setEditingDisplayOrder(null);
  }, [editingDisplayOrder, classes, onChange]);

  const handleAddClass = useCallback(() => {
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
      fieldOverrides: {},
    };
    onChange([...classes, newClass]);
  }, [classes, onChange]);

  const columns = useMemo(
    () =>
      buildColumns(
        readOnly,
        editingDisplayOrder,
        setEditingDisplayOrder,
        saveDisplayOrder,
        onEdit,
        handleDuplicate,
        handleDelete
      ),
    [
      readOnly,
      editingDisplayOrder,
      setEditingDisplayOrder,
      saveDisplayOrder,
      onEdit,
      handleDuplicate,
      handleDelete,
    ]
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Define the specific classes that will be generated from this template. Click on the display
        order to edit.
      </p>

      <DataTable<ClassDefRow>
        tableId="classDefinitions"
        columns={columns}
        data={rows}
        pageSize={9999}
        getRowId={getRowId}
        emptyState={<div className="text-muted-foreground">No classes defined yet.</div>}
        {...(readOnly
          ? {}
          : {
              selectable: 'multi' as const,
              onSelectionChange: handleSelectionChange,
              toolbar: ({ table }) => (
                <DataTableToolbar table={table}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {selectedIndices.size > 0
                          ? `${selectedIndices.size} class${selectedIndices.size !== 1 ? 'es' : ''} selected`
                          : 'No classes selected'}
                      </span>
                      {selectedIndices.size > 0 && (
                        <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Selected
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <DataTableColumnToggle />
                      <Button size="sm" onClick={handleAddClass}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Class
                      </Button>
                    </div>
                  </div>
                </DataTableToolbar>
              ),
            })}
      />
    </div>
  );
};
