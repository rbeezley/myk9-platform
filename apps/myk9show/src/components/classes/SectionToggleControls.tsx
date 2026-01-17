import React, { useState } from 'react';
import { Expand, Minimize2 } from 'lucide-react';

interface SectionToggleControlsProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  className?: string;
  allExpanded?: boolean; // Optional: external state to sync button appearance
}

const SectionToggleControls: React.FC<SectionToggleControlsProps> = ({
  onExpandAll,
  onCollapseAll,
  className = '',
  allExpanded
}) => {
  // Internal state only used when no external state is provided
  const [internalExpanded, setInternalExpanded] = useState(false);

  // Derive the displayed state from props or internal state
  const isExpanded = allExpanded !== undefined ? allExpanded : internalExpanded;

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();

    if (isExpanded) {
      onCollapseAll();
      // Only update internal state if no external state is provided
      if (allExpanded === undefined) {
        setInternalExpanded(false);
      }
    } else {
      onExpandAll();
      // Only update internal state if no external state is provided
      if (allExpanded === undefined) {
        setInternalExpanded(true);
      }
    }
  };

  return (
    <div className={`flex items-center ${className}`}>
      <button
        onClick={handleToggle}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md transition-colors duration-200 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent focus:text-accent-foreground cursor-pointer"
      >
        {isExpanded ? (
          <>
            <Minimize2 className="h-4 w-4" />
            Collapse All
          </>
        ) : (
          <>
            <Expand className="h-4 w-4" />
            Expand All
          </>
        )}
      </button>
    </div>
  );
};

export default SectionToggleControls;