import { APPLE_FONT_STYLE } from './types';

interface UserTableEmptyStateProps {
  searchTerm: string;
}

export function UserTableEmptyState({ searchTerm }: UserTableEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-border/50 bg-muted/20"
      style={APPLE_FONT_STYLE}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl" />
        <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-muted to-muted/50 border border-border/30 flex items-center justify-center mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-muted-foreground/70"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <span className="font-[500]">
            Searched for:{' '}
            <span className="font-[590] text-foreground">&quot;{searchTerm}&quot;</span>
          </span>
        </div>
      )}
    </div>
  );
}
