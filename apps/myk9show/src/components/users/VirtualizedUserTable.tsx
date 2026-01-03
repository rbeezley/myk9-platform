import React, { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { User } from '@/types/dog-types';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VirtualizedPeopleTableProps {
  people: User[];
  onViewPerson?: (id: string) => void;
  onEditPerson: (id: string) => void;
  onDeletePerson: (id: string) => void;
  className?: string;
  height?: number;
}

interface RowData {
  people: User[];
  onViewPerson?: (id: string) => void;
  onEditPerson: (id: string) => void;
  onDeletePerson: (id: string) => void;
}

// Virtualized row component for people
const PersonRow: React.FC<{
  index: number;
  style: React.CSSProperties;
  data: RowData;
}> = ({ index, style, data }) => {
  const person = data.people[index];
  
  if (!person) {
    return (
      <div style={style} className="flex items-center px-4 py-2 border-b">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div style={style} className="flex items-center border-b hover:bg-muted/50 transition-colors">
      {/* Name */}
      <div className="flex-1 px-4 py-3 text-sm font-medium">
        {person.name}
      </div>
      
      {/* Email */}
      <div className="flex-1 px-4 py-3 text-sm text-muted-foreground">
        {person.email || '-'}
      </div>
      
      {/* Phone */}
      <div className="w-40 px-4 py-3 text-sm text-muted-foreground">
        {person.phone || '-'}
      </div>
      
      {/* Type */}
      <div className="w-32 px-4 py-3">
        <span className={cn(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
          "bg-gray-100 text-gray-800"
        )}>
          User
        </span>
      </div>
      
      {/* Associated Dogs Count */}
      <div className="w-24 px-4 py-3 text-sm text-center">
        {person.dogs?.length || 0}
      </div>
      
      {/* Actions */}
      <div className="w-32 px-4 py-3">
        <div className="flex gap-1">
          {data.onViewPerson && (
            <button
              onClick={() => data.onViewPerson!(person.id)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="View User"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          
          <button
            onClick={() => data.onEditPerson(person.id)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Edit User"
          >
            <Edit className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => data.onDeletePerson(person.id)}
            className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600"
            title="Delete User"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const VirtualizedPeopleTable: React.FC<VirtualizedPeopleTableProps> = ({
  people,
  onViewPerson,
  onEditPerson,
  onDeletePerson,
  className,
  height = 600,
}) => {
  // Prepare data for virtual list
  const rowData: RowData = useMemo(() => ({
    people,
    onViewPerson,
    onEditPerson,
    onDeletePerson,
  }), [people, onViewPerson, onEditPerson, onDeletePerson]);

  const itemCount = people.length;
  const itemSize = 64; // Height of each row in pixels

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {/* Table Header */}
      <div className="bg-muted/50 border-b">
        <div className="flex items-center font-medium text-sm">
          <div className="flex-1 px-4 py-3">Name</div>
          <div className="flex-1 px-4 py-3">Email</div>
          <div className="w-40 px-4 py-3">Phone</div>
          <div className="w-32 px-4 py-3">Type</div>
          <div className="w-24 px-4 py-3 text-center">Dogs</div>
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
          {PersonRow}
        </List>
      ) : (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No people found
        </div>
      )}
    </div>
  );
};

export default React.memo(VirtualizedPeopleTable, (prevProps, nextProps) => {
  // Compare critical props that affect rendering
  if (prevProps.people.length !== nextProps.people.length) return false;
  if (prevProps.height !== nextProps.height) return false;
  
  // Shallow comparison of first few people for performance
  for (let i = 0; i < Math.min(prevProps.people.length, 10); i++) {
    const prevPerson = prevProps.people[i];
    const nextPerson = nextProps.people[i];
    
    if (prevPerson?.id !== nextPerson?.id ||
        prevPerson?.name !== nextPerson?.name ||
        prevPerson?.email !== nextPerson?.email) {
      return false;
    }
  }
  
  return true;
});