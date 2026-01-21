/**
 * BottomSheet Component - Migrated to Tailwind CSS
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
import { cn } from '../../lib/utils';

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

const heightClasses = {
  auto: 'max-h-[80vh]',
  half: 'h-[50vh]',
  full: 'h-[90vh]',
} as const;

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
    <div
      className={cn(
        'fixed inset-0 z-[var(--token-z-modal)]',
        'bg-black/50 backdrop-blur-sm',
        'animate-fade-in'
      )}
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        className={cn(
          'absolute bottom-0 left-0 right-0',
          'bg-[var(--card)]',
          'rounded-t-2xl',
          'shadow-[0_-4px_20px_rgba(0,0,0,0.15)]',
          'overflow-hidden',
          heightClasses[height],
          'pb-[env(safe-area-inset-bottom,0)]',
          isDragging ? '' : 'transition-transform duration-300',
          'animate-slide-in-bottom'
        )}
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
          <div className="flex justify-center py-3">
            <div className="w-10 h-1 bg-[var(--muted-foreground)]/30 rounded-full" />
          </div>
        )}

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {title}
            </h2>
            <button
              className={cn(
                'p-2 rounded-full',
                'bg-transparent border-none cursor-pointer',
                'text-[var(--muted-foreground)]',
                'hover:bg-[var(--muted)]',
                'min-w-[44px] min-h-[44px]',
                'flex items-center justify-center'
              )}
              onClick={onClose}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
      </div>
    </div>
  );

  // Render via portal to escape parent overflow/transform constraints
  return createPortal(bottomSheetContent, getBottomSheetPortalRoot());
}
