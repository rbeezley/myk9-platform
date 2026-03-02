/**
 * UserTableEmptyState - Premium empty state display
 */

import React from 'react';
import { User as UserIcon, Search } from 'lucide-react';
import { APPLE_FONT_STYLE } from './types';

interface UserTableEmptyStateProps {
  searchTerm: string;
}

export const UserTableEmptyState: React.FC<UserTableEmptyStateProps> = ({
  searchTerm,
}) => {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-border/50 bg-muted/20"
      style={APPLE_FONT_STYLE}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl" />
        <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-muted to-muted/50 border border-border/30 flex items-center justify-center mb-6">
          <UserIcon className="h-10 w-10 text-muted-foreground/70" />
        </div>
      </div>

      <h3 className="text-xl font-[650] text-foreground mb-3 tracking-tight">
        {searchTerm ? 'No Matching Users' : 'No Users Found'}
      </h3>

      <p className="text-muted-foreground mb-6 max-w-md font-[500] leading-relaxed">
        {searchTerm
          ? `No users match "${searchTerm}". Try adjusting your search terms or filters.`
          : 'There are no users to display. Users will appear here once they are added to the system.'}
      </p>

      {searchTerm && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          <span className="font-[500]">
            Searched for:{' '}
            <span className="font-[590] text-foreground">
              &quot;{searchTerm}&quot;
            </span>
          </span>
        </div>
      )}
    </div>
  );
};
