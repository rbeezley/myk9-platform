import React, { useCallback } from 'react';
import { Dialog, DialogContent, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AppleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
  className?: string;
  showFooter?: boolean;
}

/**
 * Enhanced Apple-styled dialog component that matches our established patterns.
 * Provides consistent styling with the form dialogs we've been creating.
 */
export const AppleDialog: React.FC<AppleDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  onCancel,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  saveDisabled = false,
  maxWidth = '2xl',
  className = '',
  showFooter = true,
}) => {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleSave = () => {
    onSave?.();
  };

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md', 
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
  }[maxWidth];

  // Use more viewport width for larger dialogs
  const getViewportWidth = () => {
    if (['6xl', '7xl'].includes(maxWidth)) return 'w-[95vw]';
    if (['4xl', '5xl'].includes(maxWidth)) return 'w-[90vw]';
    return 'w-[85vw]';
  };

  // Enhanced onOpenChange handler that prevents unwanted closes from panel interactions
  const handleOpenChange = useCallback((newOpen: boolean) => {
    // If opening the dialog, always allow
    if (newOpen) {
      onOpenChange(newOpen);
      return;
    }

    // If closing, check if it's due to panel interaction
    const activeElement = document.activeElement;
    const clickedElement = document.elementFromPoint(
      window.innerWidth / 2, 
      window.innerHeight / 2
    ) || activeElement;

    // Multiple detection methods for panel interactions
    const isPanelInteraction = 
      // Check active element (focused element)
      activeElement?.closest('[data-panel-stack]') ||
      activeElement?.closest('.slide-over-panel') ||
      activeElement?.closest('[aria-labelledby="panel-title"]') ||
      // Check clicked element
      clickedElement?.closest('[data-panel-stack]') ||
      clickedElement?.closest('.slide-over-panel') ||
      clickedElement?.closest('[aria-labelledby="panel-title"]') ||
      // Check if any panel is currently visible
      document.querySelector('.slide-over-panel[style*="translate-x-0"]') ||
      document.querySelector('[data-panel-stack] [role="dialog"]:not(.wizard-dialog)') ||
      // Check for panel-specific elements
      activeElement?.closest('form') && activeElement?.closest('[data-panel-stack]') ||
      // Check input/textarea elements within panels
      (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') &&
      (activeElement?.closest('.slide-over-panel') || activeElement?.closest('[data-panel-stack]'));

    if (isPanelInteraction) {
      // Prevent the dialog close - user is interacting with a panel
      console.log('AppleDialog: Preventing close due to panel interaction', {
        activeElement: activeElement?.tagName,
        activeElementClasses: activeElement?.className,
        activeElementClosest: {
          panelStack: !!activeElement?.closest('[data-panel-stack]'),
          slideOver: !!activeElement?.closest('.slide-over-panel'),
          panelTitle: !!activeElement?.closest('[aria-labelledby="panel-title"]')
        }
      });
      return;
    }

    // Allow legitimate close events
    onOpenChange(newOpen);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogOverlay className="dialog-overlay" />
      <DialogContent className={`dialog-content ${maxWidthClass} ${getViewportWidth()} ${className}`}>
        {/* Header */}
        <div style={{ padding: '8px 0 8px 0' }}>
          <h2 style={{ 
            margin: '0', 
            fontSize: '1.125rem', 
            fontWeight: '600', 
            color: 'var(--foreground)' 
          }}>
            {title}
          </h2>
          {description && (
            <p style={{ 
              margin: '8px 0 0 0', 
              fontSize: '0.875rem', 
              color: 'var(--muted-foreground)' 
            }}>
              {description}
            </p>
          )}
        </div>
        
        {/* Body - Scrollable Content Area */}
        <div className="dialog-body-scrollable">
          {children}
        </div>
        
        {/* Footer - Sticky at Bottom */}
        {showFooter && (
          <div className="dialog-footer-sticky">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              className="dialog-button-cancel"
            >
              {cancelLabel}
            </Button>
            <Button 
              onClick={handleSave}
              disabled={saveDisabled}
              className="dialog-button-save"
            >
              {saveLabel}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

interface AppleDialogActionsProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Container for dialog action buttons with proper Apple-style spacing and layout.
 */
export const AppleDialogActions: React.FC<AppleDialogActionsProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`apple-dialog-footer ${className}`}>
      <div className="apple-dialog-actions">
        {children}
      </div>
    </div>
  );
};

interface AppleButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
}

/**
 * Apple-styled button component for use in dialogs.
 */
export const AppleButton: React.FC<AppleButtonProps> = ({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  disabled = false,
  className = '',
}) => {
  const baseClasses = variant === 'primary' ? 'apple-button-primary' : 'apple-button-secondary';
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${className}`}
    >
      {children}
    </button>
  );
};

interface AppleFormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Apple-styled form field container with proper label and error styling.
 * Matches the form-field pattern used in our dialogs.
 */
export const AppleFormField: React.FC<AppleFormFieldProps> = ({
  label,
  required = false,
  error,
  children,
  className = '',
}) => {
  return (
    <div className={`form-field ${className}`}>
      <label className={`form-label ${required ? 'required' : ''}`}>
        {label}
      </label>
      {children}
      {error && <div className="text-destructive text-sm mt-1">{error}</div>}
    </div>
  );
};

interface AppleFormGridProps {
  children: React.ReactNode;
  columns?: 1 | 2;
  className?: string;
}

/**
 * Grid container for form fields with proper spacing.
 */
export const AppleFormGrid: React.FC<AppleFormGridProps> = ({
  children,
  columns = 2,
  className = '',
}) => {
  const gridClass = columns === 2 ? 'grid grid-cols-2 gap-4' : '';
  
  return (
    <div className={`${gridClass} mb-4 ${className}`}>
      {children}
    </div>
  );
};

export default AppleDialog;