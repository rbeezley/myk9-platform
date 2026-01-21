/**
 * CollapsibleSection Component - Migrated to Tailwind CSS
 *
 * Reusable collapsible section with smooth expand/collapse transitions
 * and accessibility support. Respects reduce motion preferences.
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { cn } from '../../lib/utils';

export interface CollapsibleSectionProps {
  /** Section title */
  title: string;

  /** Section description */
  description?: string;

  /** Initial expanded state */
  defaultExpanded?: boolean;

  /** Section content */
  children: React.ReactNode;

  /** Optional class name */
  className?: string;

  /** Section ID for deep linking */
  id?: string;

  /** Badge count (optional) */
  badge?: number;

  /** Icon (optional) */
  icon?: React.ReactNode;

  /** Callback when expanded state changes */
  onExpandChange?: (expanded: boolean) => void;
}

export function CollapsibleSection({
  title,
  description,
  defaultExpanded = false,
  children,
  className,
  id,
  badge,
  icon,
  onExpandChange,
}: CollapsibleSectionProps) {
  // Use lazy initialization to check hash on mount
  const [isExpanded, setIsExpanded] = useState(() => {
    if (id && window.location.hash === `#${id}`) {
      return true;
    }
    return defaultExpanded;
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReduceMotion();

  // Scroll to section after mount if hash matches
  useEffect(() => {
    if (id && window.location.hash === `#${id}`) {
      // Scroll to section after a small delay
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [id]);

  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    onExpandChange?.(newState);

    // Update URL hash when expanding (optional)
    if (id && newState) {
      history.replaceState(null, '', `#${id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded();
    }
  };

  return (
    <section
      id={id}
      className={cn(
        'bg-[var(--card)] rounded-xl border border-[var(--border)]',
        'overflow-hidden',
        reduceMotion ? '' : 'transition-all duration-300',
        className
      )}
      aria-labelledby={`${id}-header`}
    >
      <div
        className={cn(
          'flex items-center justify-between',
          'p-4 cursor-pointer',
          'hover:bg-[var(--muted)]/30',
          'transition-colors duration-200'
        )}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={`${id}-content`}
        id={`${id}-header`}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <span className="text-[var(--primary)] flex-shrink-0" aria-hidden="true">
              {icon}
            </span>
          )}
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
              {title}
              {badge !== undefined && badge > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center',
                    'px-2 py-0.5 rounded-full',
                    'bg-[var(--primary)] text-white',
                    'text-xs font-medium'
                  )}
                  aria-label={`${badge} settings`}
                >
                  {badge}
                </span>
              )}
            </h2>
            {description && (
              <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        <button
          className={cn(
            'p-2 rounded-lg',
            'bg-transparent border-none cursor-pointer',
            'text-[var(--muted-foreground)]',
            'hover:bg-[var(--muted)]',
            'transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
          aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded();
          }}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      <div
        ref={contentRef}
        id={`${id}-content`}
        className={cn(
          'overflow-hidden',
          reduceMotion ? '' : 'transition-all duration-300',
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
        role="region"
        aria-labelledby={`${id}-header`}
        aria-hidden={!isExpanded}
      >
        <div className="px-4 pb-4 pt-2 border-t border-[var(--border)]">
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * Collapsible section group for managing multiple sections
 */
export interface CollapsibleSectionGroupProps {
  /** Children sections */
  children: React.ReactNode;

  /** Allow multiple sections to be expanded at once */
  allowMultiple?: boolean;

  /** Default expanded section ID */
  defaultExpandedId?: string;

  /** Class name */
  className?: string;
}

export function CollapsibleSectionGroup({
  children,
  allowMultiple = true,
  defaultExpandedId,
  className,
}: CollapsibleSectionGroupProps) {
  // Props reserved for future group coordination feature
  void allowMultiple;
  void defaultExpandedId;

  return <div className={cn('flex flex-col gap-4', className)}>{children}</div>;
}
