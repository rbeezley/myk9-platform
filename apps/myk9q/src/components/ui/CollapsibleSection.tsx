/**
 * Collapsible Section Component
 *
 * Reusable collapsible section with smooth expand/collapse transitions
 * and accessibility support. Respects reduce motion preferences.
 */

import { useState, useRef, useEffect } from 'react';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import './shared-ui.css';

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
  className = '',
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
      className={`collapsible-section ${isExpanded ? 'expanded' : 'collapsed'} ${className} ${
        reduceMotion ? 'reduce-motion' : ''
      }`}
      aria-labelledby={`${id}-header`}
    >
      <div
        className="section-header"
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={`${id}-content`}
        id={`${id}-header`}
      >
        <div className="header-content">
          {icon && <span className="section-icon" aria-hidden="true">{icon}</span>}
          <div className="header-text">
            <h2 className="section-title">
              {title}
              {badge !== undefined && badge > 0 && (
                <span className="section-badge" aria-label={`${badge} settings`}>
                  {badge}
                </span>
              )}
            </h2>
            {description && (
              <p className="section-description">{description}</p>
            )}
          </div>
        </div>
        <button
          className="expand-button"
          aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded();
          }}
        >
          <svg
            className="expand-icon"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div
        ref={contentRef}
        id={`${id}-content`}
        className="section-content"
        role="region"
        aria-labelledby={`${id}-header`}
        aria-hidden={!isExpanded}
      >
        <div className="section-content-inner">
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
  className = '',
}: CollapsibleSectionGroupProps) {
  // Props reserved for future group coordination feature
  void allowMultiple;
  void defaultExpandedId;

  return (
    <div className={`collapsible-section-group ${className}`}>
      {children}
    </div>
  );
}
