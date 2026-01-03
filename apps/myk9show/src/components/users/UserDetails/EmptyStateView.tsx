import React from 'react';
import { cn } from '@/lib/utils';
import { UserPlus } from 'lucide-react';

interface EmptyStateViewProps {
  isSidebarCollapsed: boolean;
}

const EmptyStateView: React.FC<EmptyStateViewProps> = ({ isSidebarCollapsed }) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-[calc(100vh-180px)] p-8 text-center",
      isSidebarCollapsed ? "ml-0" : "ml-0 md:ml-4"
    )}>
      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
        <UserPlus className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-bold mb-2">No User Selected</h2>
      <p className="text-muted-foreground max-w-md">
        Select a person from the sidebar to view their details, or create a new person to add to your database.
      </p>
    </div>
  );
};

export default EmptyStateView;
