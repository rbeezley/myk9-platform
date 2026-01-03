/**
 * BottomSheet Component
 *
 * Thumb-friendly modal that slides up from the bottom of the screen.
 * Perfect for mobile actions that need to be easily reachable with one hand.
 *
 * Features:
 * - Slides up from bottom (thumb zone)
 * - Drag to dismiss
 * - Backdrop click to dismiss
 * - Snap points for different heights
 * - Safe area support (iOS notch)
 * - Keyboard avoidance
 */

import { useEffect, useState, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './shared-ui.css';

// Create or get the portal root element for bottom sheets
function getBottomSheetPortalRoot(): HTMLElement {
  let portalRoot = document.getElementById('bottom-sheet-portal-root');
  if (!portalRoot) {
    portalRoot = document.createElement('div');
    portalRoot.id = 'bottom-sheet-portal-root';
    document.body.appendChild(portalRoot);
  }
  return portalRoot;
}

export interface BottomSheetProps {
  /**
   * Whether the bottom sheet is open
   */
  isOpen: boolean;

  /**
   * Callback when bottom sheet should close
   */
  onClose: () => void;

  /**
   * Content to display in the bottom sheet
   */
  children: ReactNode;

  /**
   * Title to display in the header
   */
  title?: string;

  /**
   * Height of the bottom sheet
   * - 'auto': Fit content
   * - 'half': 50% of screen
   * - 'full': 90% of screen
   */
  height?: 'auto' | 'half' | 'full';

  /**
   * Whether to show the drag handle
   */
  showDragHandle?: boolean;

  /**
   * Whether to allow backdrop click to close
   */
  closeOnBackdrop?: boolean;

  /**
   * Whether to allow drag to dismiss
   */
  dragToDismiss?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  height = 'auto',
  showDragHandle = true,
  closeOnBackdrop = true,
  dragToDismiss = true,
}: BottomSheetProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle drag start
  const handleDragStart = (clientY: number) => {
    if (!dragToDismiss) return;
    setIsDragging(true);
    startY.current = clientY;
  };

  // Handle drag move
  const handleDragMove = (clientY: number) => {
    if (!isDragging || !dragToDismiss) return;

    const delta = clientY - startY.current;
    // Only allow dragging down
    if (delta > 0) {
      setDragOffset(delta);
    }
  };

  // Handle drag end
  const handleDragEnd = () => {
    if (!isDragging || !dragToDismiss) return;

    setIsDragging(false);

    // If dragged more than 100px, close
    if (dragOffset > 100) {
      onClose();
    }

    // Reset offset
    setDragOffset(0);
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientY);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Backdrop click
  const handleBackdropClick = () => {
    if (closeOnBackdrop) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const bottomSheetContent = (
    <div className="bottom-sheet-overlay" onClick={handleBackdropClick}>
      <div
        ref={sheetRef}
        className={`bottom-sheet bottom-sheet-${height} ${isDragging ? 'bottom-sheet-dragging' : ''}`}
        style={{
          transform: `translateY(${dragOffset}px)`,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        {showDragHandle && (
          <div className="bottom-sheet-handle">
            <div className="bottom-sheet-handle-bar" />
          </div>
        )}

        {/* Header */}
        {title && (
          <div className="bottom-sheet-header">
            <h2 className="bottom-sheet-title">{title}</h2>
            <button
              className="bottom-sheet-close touch-target-icon"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="bottom-sheet-content">
          {children}
        </div>
      </div>
    </div>
  );

  // Render via portal to escape parent overflow/transform constraints
  return createPortal(bottomSheetContent, getBottomSheetPortalRoot());
}
