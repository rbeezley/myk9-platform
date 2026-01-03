import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Popover.css';

// Create or get the portal root element
function getPortalRoot(): HTMLElement {
  let portalRoot = document.getElementById('popover-portal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'popover-portal-root';
    // Ensure portal root is at the end of body with highest stacking context
    portalRoot.style.position = 'fixed';
    portalRoot.style.top = '0';
    portalRoot.style.left = '0';
    portalRoot.style.width = '0';
    portalRoot.style.height = '0';
    portalRoot.style.overflow = 'visible';
    portalRoot.style.zIndex = '99999';
    portalRoot.style.pointerEvents = 'none';
    document.body.appendChild(portalRoot);
  }
  return portalRoot;
}

export type PopoverPosition = 'top' | 'bottom' | 'left' | 'right';
export type PopoverAlignment = 'start' | 'center' | 'end';

export interface PopoverProps {
  /** Whether the popover is visible */
  isOpen: boolean;
  /** Called when the popover should close */
  onClose: () => void;
  /** The element that triggers/anchors the popover */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Popover content */
  children: React.ReactNode;
  /** Position relative to anchor (default: 'bottom') */
  position?: PopoverPosition;
  /** Alignment along the position axis (default: 'start') */
  alignment?: PopoverAlignment;
  /** Optional title for the popover header */
  title?: string;
  /** Show close button in header (default: true if title provided) */
  showCloseButton?: boolean;
  /** Additional CSS class for the popover container */
  className?: string;
  /** Close when clicking outside (default: true) */
  closeOnClickOutside?: boolean;
  /** Close when pressing Escape (default: true) */
  closeOnEscape?: boolean;
  /** Offset from anchor in pixels (default: 8) */
  offset?: number;
}

/**
 * Popover component that renders content in a portal, escaping parent overflow constraints.
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * const buttonRef = useRef<HTMLButtonElement>(null);
 *
 * <button ref={buttonRef} onClick={() => setIsOpen(true)}>
 *   Open Popover
 * </button>
 *
 * <Popover
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   anchorRef={buttonRef}
 *   title="Settings"
 * >
 *   <p>Popover content here</p>
 * </Popover>
 * ```
 */
export function Popover({
  isOpen,
  onClose,
  anchorRef,
  children,
  position = 'bottom',
  alignment = 'start',
  title,
  showCloseButton,
  className = '',
  closeOnClickOutside = true,
  closeOnEscape = true,
  offset = 8,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [actualPosition, setActualPosition] = useState(position);

  // Calculate position based on anchor element
  const updatePosition = useCallback(() => {
    if (!anchorRef.current || !popoverRef.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;
    let finalPosition = position;

    // Calculate initial position
    switch (position) {
      case 'bottom':
        top = anchorRect.bottom + offset;
        break;
      case 'top':
        top = anchorRect.top - popoverRect.height - offset;
        break;
      case 'left':
        left = anchorRect.left - popoverRect.width - offset;
        top = anchorRect.top;
        break;
      case 'right':
        left = anchorRect.right + offset;
        top = anchorRect.top;
        break;
    }

    // Calculate alignment for top/bottom positions
    if (position === 'top' || position === 'bottom') {
      switch (alignment) {
        case 'start':
          left = anchorRect.left;
          break;
        case 'center':
          left = anchorRect.left + (anchorRect.width - popoverRect.width) / 2;
          break;
        case 'end':
          left = anchorRect.right - popoverRect.width;
          break;
      }
    }

    // Calculate alignment for left/right positions
    if (position === 'left' || position === 'right') {
      switch (alignment) {
        case 'start':
          top = anchorRect.top;
          break;
        case 'center':
          top = anchorRect.top + (anchorRect.height - popoverRect.height) / 2;
          break;
        case 'end':
          top = anchorRect.bottom - popoverRect.height;
          break;
      }
    }

    // Flip position if it would overflow viewport
    if (position === 'bottom' && top + popoverRect.height > viewportHeight - 16) {
      // Try top instead
      const topPosition = anchorRect.top - popoverRect.height - offset;
      if (topPosition > 16) {
        top = topPosition;
        finalPosition = 'top';
      }
    } else if (position === 'top' && top < 16) {
      // Try bottom instead
      const bottomPosition = anchorRect.bottom + offset;
      if (bottomPosition + popoverRect.height < viewportHeight - 16) {
        top = bottomPosition;
        finalPosition = 'bottom';
      }
    }

    // Constrain to viewport horizontally
    if (left < 16) {
      left = 16;
    } else if (left + popoverRect.width > viewportWidth - 16) {
      left = viewportWidth - popoverRect.width - 16;
    }

    // Constrain to viewport vertically
    if (top < 16) {
      top = 16;
    } else if (top + popoverRect.height > viewportHeight - 16) {
      top = viewportHeight - popoverRect.height - 16;
    }

    setCoords({ top, left });
    setActualPosition(finalPosition);
  }, [anchorRef, position, alignment, offset]);

  // Update position on open and when dependencies change
  useEffect(() => {
    if (isOpen) {
      // Use requestAnimationFrame to ensure popover is rendered before measuring
      requestAnimationFrame(() => {
        updatePosition();
      });
    }
  }, [isOpen, updatePosition]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!isOpen) return;

    const handleUpdate = () => updatePosition();

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isOpen, updatePosition]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen || !closeOnClickOutside) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking the anchor or inside the popover
      if (
        anchorRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      onClose();
    };

    // Use mousedown for immediate response
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeOnClickOutside, onClose, anchorRef]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const hasHeader = title || showCloseButton;
  const shouldShowClose = showCloseButton ?? !!title;

  const popoverContent = (
    <div
      ref={popoverRef}
      className={`popover popover-${actualPosition} ${className}`}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
      }}
      role="dialog"
      aria-modal="false"
      aria-label={title}
    >
      {hasHeader && (
        <div className="popover-header">
          {title && <span className="popover-title">{title}</span>}
          {shouldShowClose && (
            <button
              className="popover-close"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="popover-content">
        {children}
      </div>
    </div>
  );

  // Render in portal at dedicated portal root
  return createPortal(popoverContent, getPortalRoot());
}

export default Popover;
