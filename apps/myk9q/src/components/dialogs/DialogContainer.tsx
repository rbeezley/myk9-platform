/**
 * DialogContainer - Reusable modal wrapper component
 *
 * Provides the standard dialog structure (overlay, container, header, content).
 * New dialogs should use this instead of duplicating the structure.
 *
 * @example
 * ```tsx
 * <DialogContainer
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Confirm Action"
 *   icon={<AlertTriangle />}
 *   maxWidth="400px"
 * >
 *   <p>Are you sure?</p>
 *   <div className="dialog-actions">
 *     <button onClick={handleClose}>Cancel</button>
 *     <button onClick={handleConfirm}>Confirm</button>
 *   </div>
 * </DialogContainer>
 * ```
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './shared-dialog.css';

export interface DialogContainerProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when dialog should close (overlay click, X button, escape key) */
  onClose: () => void;
  /** Dialog title (displayed in header) */
  title: string;
  /** Optional icon to display before title */
  icon?: React.ReactNode;
  /** Dialog content */
  children: React.ReactNode;
  /** Optional additional class for the container */
  className?: string;
  /** Whether to render in a portal (default: true) */
  usePortal?: boolean;
  /** Max width of dialog (default: 100%) */
  maxWidth?: string;
  /** Whether clicking overlay closes dialog (default: true) */
  closeOnOverlayClick?: boolean;
  /** Whether to show close button in header (default: true) */
  showCloseButton?: boolean;
  /** Optional header content to replace default title */
  headerContent?: React.ReactNode;
}

export const DialogContainer: React.FC<DialogContainerProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  children,
  className = '',
  usePortal = true,
  maxWidth,
  closeOnOverlayClick = true,
  showCloseButton = true,
  headerContent,
}) => {
  // Handle escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const dialogContent = (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div
        className={`dialog-container ${className}`}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="dialog-header">
          {headerContent ?? (
            <div className="dialog-title" id="dialog-title">
              {icon && <span className="dialog-title-icon">{icon}</span>}
              <span>{title}</span>
            </div>
          )}
          {showCloseButton && (
            <button
              className="close-button"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={20} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            </button>
          )}
        </div>

        <div className="dialog-content">
          {children}
        </div>
      </div>
    </div>
  );

  if (usePortal) {
    return createPortal(dialogContent, document.body);
  }

  return dialogContent;
};

export default DialogContainer;
