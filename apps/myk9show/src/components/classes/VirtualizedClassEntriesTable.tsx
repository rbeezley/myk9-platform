import React, { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Eye, Pencil, Clock, Trash2, Plus } from 'lucide-react';
// Removed unused table imports - using custom virtualized layout
import { EntryData } from './types/classTypes';
import { ShowType, ClassTemplate } from '@/types/template.types';
import { UserPermissions } from '@/types/user-permissions';
import { cn } from '@/lib/utils';

interface VirtualizedClassEntriesTableProps {
  entries: EntryData[];
  showType: ShowType;
  template?: ClassTemplate;
  onViewEntry?: (id: string) => void;
  onEditEntry: (id: string) => void;
  onEnterResults?: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onAddEntry: () => void;
  enableInlineEditing?: boolean;
  onResultUpdate?: (entryId: string, result: Partial<EntryData>) => Promise<void>;
  onToggleInlineEditing?: () => void;
  userPermissions?: UserPermissions;
  className?: string;
  height?: number; // Height of the virtualized container
}

interface RowData {
  entries: EntryData[];
  showType: ShowType;
  template?: ClassTemplate;
  onViewEntry?: (id: string) => void;
  onEditEntry: (id: string) => void;
  onEnterResults?: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  enableInlineEditing?: boolean;
  onResultUpdate?: (entryId: string, result: Partial<EntryData>) => Promise<void>;
  userPermissions?: UserPermissions;
}

// Virtualized row component
const EntryRow: React.FC<{
  index: number;
  style: React.CSSProperties;
  data: RowData;
}> = ({ index, style, data }) => {
  const entry = data.entries[index];
  
  if (!entry) {
    return (
      <div style={style} className="flex items-center px-4 py-2 border-b">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div style={style} className="flex items-center border-b hover:bg-muted/50 transition-colors">
      {/* Armband */}
      <div className="w-20 px-4 py-2 text-sm font-medium">
        {entry.armband}
      </div>
      
      {/* Handler */}
      <div className="flex-1 px-4 py-2 text-sm">
        {entry.handler}
      </div>
      
      {/* Dog */}
      <div className="flex-1 px-4 py-2 text-sm">
        {entry.dog}
      </div>
      
      {/* Status */}
      <div className="w-32 px-4 py-2">
        <span className={cn(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
          entry.status === 'Qualified' && "bg-green-100 text-green-800",
          entry.status === 'Not Qualified' && "bg-red-100 text-red-800",
          entry.status === 'Absent' && "bg-gray-100 text-gray-800",
          entry.status === 'Excused' && "bg-yellow-100 text-yellow-800",
          entry.status === 'Withdrawn' && "bg-orange-100 text-orange-800",
          entry.status === 'Eliminated' && "bg-red-100 text-red-800"
        )}>
          {entry.status}
        </span>
      </div>
      
      {/* Score */}
      <div className="w-24 px-4 py-2 text-sm">
        {entry.score || '-'}
      </div>
      
      {/* Time */}
      <div className="w-24 px-4 py-2 text-sm">
        {entry.time || '-'}
      </div>
      
      {/* Placement */}
      <div className="w-24 px-4 py-2 text-sm">
        {entry.placement || '-'}
      </div>
      
      {/* Actions */}
      <div className="w-32 px-4 py-2">
        <div className="flex gap-1">
          {data.onViewEntry && (
            <button
              onClick={() => data.onViewEntry!(entry.id)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="View Entry"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          
          <button
            onClick={() => data.onEditEntry(entry.id)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Edit Entry"
          >
            <Pencil className="h-4 w-4" />
          </button>
          
          {data.onEnterResults && (
            <button
              onClick={() => data.onEnterResults!(entry.id)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Enter Results"
            >
              <Clock className="h-4 w-4" />
            </button>
          )}
          
          <button
            onClick={() => data.onDeleteEntry(entry.id)}
            className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600"
            title="Delete Entry"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const VirtualizedClassEntriesTable: React.FC<VirtualizedClassEntriesTableProps> = ({
  entries,
  showType,
  template,
  onViewEntry,
  onEditEntry,
  onEnterResults,
  onDeleteEntry,
  onAddEntry,
  enableInlineEditing = false,
  onResultUpdate,
  onToggleInlineEditing,
  userPermissions,
  className,
  height = 600, // Default height
}) => {
  // Prepare data for virtual list
  const rowData: RowData = useMemo(() => ({
    entries,
    showType,
    template,
    onViewEntry,
    onEditEntry,
    onEnterResults,
    onDeleteEntry,
    enableInlineEditing,
    onResultUpdate,
    userPermissions,
  }), [
    entries,
    showType,
    template,
    onViewEntry,
    onEditEntry,
    onEnterResults,
    onDeleteEntry,
    enableInlineEditing,
    onResultUpdate,
    userPermissions,
  ]);

  const itemCount = entries.length;
  const itemSize = 60; // Height of each row in pixels

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {/* Table Header */}
      <div className="bg-muted/50 border-b">
        <div className="flex items-center font-medium text-sm">
          <div className="w-20 px-4 py-3">Armband</div>
          <div className="flex-1 px-4 py-3">Handler</div>
          <div className="flex-1 px-4 py-3">Dog</div>
          <div className="w-32 px-4 py-3">Status</div>
          <div className="w-24 px-4 py-3">Score</div>
          <div className="w-24 px-4 py-3">Time</div>
          <div className="w-24 px-4 py-3">Place</div>
          <div className="w-32 px-4 py-3">Actions</div>
        </div>
      </div>

      {/* Virtualized Table Body */}
      {itemCount > 0 ? (
        <List
          height={height}
          width="100%"
          itemCount={itemCount}
          itemSize={itemSize}
          itemData={rowData}
          overscanCount={10} // Render extra items for smooth scrolling
        >
          {EntryRow}
        </List>
      ) : (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No entries found
        </div>
      )}

      {/* Add Entry Footer */}
      <div className="border-t bg-muted/25 p-4">
        <button
          onClick={onAddEntry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Entry
        </button>
        
        {onToggleInlineEditing && (
          <button
            onClick={onToggleInlineEditing}
            className="ml-2 inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors"
          >
            {enableInlineEditing ? 'Disable' : 'Enable'} Inline Editing
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(VirtualizedClassEntriesTable, (prevProps, nextProps) => {
  // Compare critical props that affect rendering
  if (prevProps.entries.length !== nextProps.entries.length) return false;
  if (prevProps.showType !== nextProps.showType) return false;
  if (prevProps.enableInlineEditing !== nextProps.enableInlineEditing) return false;
  if (prevProps.height !== nextProps.height) return false;
  
  // Compare template if provided
  if (prevProps.template?.id !== nextProps.template?.id) return false;
  
  // Shallow comparison of entries for performance
  for (let i = 0; i < Math.min(prevProps.entries.length, 10); i++) {
    const prevEntry = prevProps.entries[i];
    const nextEntry = nextProps.entries[i];
    
    if (prevEntry?.id !== nextEntry?.id ||
        prevEntry?.status !== nextEntry?.status ||
        prevEntry?.score !== nextEntry?.score ||
        prevEntry?.time !== nextEntry?.time) {
      return false;
    }
  }
  
  return true;
});