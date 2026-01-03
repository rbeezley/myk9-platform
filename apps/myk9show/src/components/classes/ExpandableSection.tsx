import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ExpandableSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  initialExpanded?: boolean;
  storageKey?: string; // For localStorage persistence
  contentCount?: number; // Number of populated fields
  className?: string;
  priority?: 'critical' | 'important' | 'utility'; // Section importance level
  forceExpanded?: boolean; // External control for expand all
  forceCollapsed?: boolean; // External control for collapse all
}

const ExpandableSection: React.FC<ExpandableSectionProps> = ({
  title,
  icon,
  children,
  initialExpanded = false,
  storageKey,
  contentCount,
  className = '',
  priority = 'utility',
  forceExpanded,
  forceCollapsed
}) => {
  // Smart default expansion logic
  const getSmartDefault = (): boolean => {
    // If user has explicitly set a preference, respect it
    if (storageKey) {
      const saved = localStorage.getItem(`expandable-${storageKey}`);
      if (saved !== null) {
        return JSON.parse(saved);
      }
    }
    
    // Smart defaults based on priority and content
    if (priority === 'critical') {
      // Always expand critical sections if they have content
      return Boolean(contentCount && contentCount > 0);
    } else if (priority === 'important') {
      // Always expand important sections if they have content
      return Boolean(contentCount && contentCount > 0);
    } else {
      // Utility sections: collapse by default, even with content
      return initialExpanded;
    }
  };

  const [isExpanded, setIsExpanded] = useState(() => {
    return getSmartDefault();
  });

  // Handle external force controls
  useEffect(() => {
    if (forceExpanded && contentCount && contentCount > 0) {
      setIsExpanded(true);
    } else if (forceCollapsed) {
      setIsExpanded(false);
    }
  }, [forceExpanded, forceCollapsed, contentCount]);

  const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    
    // Save to localStorage if storageKey is provided
    if (storageKey) {
      localStorage.setItem(`expandable-${storageKey}`, JSON.stringify(newExpanded));
    }
  };

  // Don't render if no content
  if (contentCount === 0) {
    return null;
  }

  // Priority-based styling
  const getPriorityStyles = () => {
    switch (priority) {
      case 'critical':
        return 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/30';
      case 'important':
        return 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/30';
      default:
        return 'border-border bg-background';
    }
  };

  const getPriorityIndicator = () => {
    switch (priority) {
      case 'critical':
        return <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" title="Critical information" />;
      case 'important':
        return <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400" title="Important information" />;
      default:
        return null;
    }
  };

  return (
    <div className={`expandable-section ${className}`}>
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          handleToggle(e as React.MouseEvent);
        }}
        className={`expandable-section-header w-full flex items-center justify-between py-3 px-4 text-left border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer select-none ${getPriorityStyles()}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleToggle(e as React.KeyboardEvent);
          }
        }}
      >
        <div className="flex items-center gap-3" style={{ pointerEvents: 'none' }}>
          {getPriorityIndicator()}
          <div className="text-muted-foreground">
            {icon}
          </div>
          <span className="font-medium text-sm">{title}</span>
          {contentCount && contentCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {contentCount} field{contentCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground" style={{ pointerEvents: 'none' }}>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </div>
      
      <div 
        className={`expandable-section-content overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-screen opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'
        }`}
      >
        <div className="pl-4 pr-4 pb-2">
          <div className="expandable-section-grid grid grid-cols-2 gap-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpandableSection;