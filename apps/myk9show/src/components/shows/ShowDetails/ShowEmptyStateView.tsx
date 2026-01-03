import React from 'react';

interface ShowEmptyStateViewProps {
  isSidebarCollapsed?: boolean;
}

const ShowEmptyStateView: React.FC<ShowEmptyStateViewProps> = ({ isSidebarCollapsed }) => (
  <div className="flex flex-col items-center justify-center h-full w-full text-center p-12">
    <div className="text-4xl mb-4">🐾</div>
    <h2 className="text-xl font-semibold mb-2">No show selected</h2>
    <p className="text-muted-foreground mb-4">Select a show from the sidebar to view its details.</p>
    {!isSidebarCollapsed && (
      <span className="text-xs text-muted-foreground">Tip: Use the search or collapse the sidebar for more space.</span>
    )}
  </div>
);

export default ShowEmptyStateView;
