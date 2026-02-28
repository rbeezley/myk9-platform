import React, { useEffect, useRef } from 'react';

interface CommonDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleIcon?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string; // e.g. 'max-w-lg'
}

export const CommonDialog: React.FC<CommonDialogProps> = ({
  open,
  onClose,
  title,
  titleIcon,
  description,
  children,
  footer,
  maxWidth = 'max-w-lg',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-focus management for accessibility
  useEffect(() => {
    if (open && dialogRef.current) {
      // Focus first focusable element
      const focusableElements = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      if (firstElement) {
        firstElement.focus();
      }
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div
        ref={dialogRef}
        className={`w-full ${maxWidth} max-h-[90vh] flex flex-col bg-background border border-border rounded-2xl shadow-xl mx-4 p-6`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            {title && (
              <h2
                id="dialog-title"
                className="text-xl font-semibold text-foreground flex items-center gap-3"
              >
                {titleIcon && <span className="text-destructive">{titleIcon}</span>}
                {title}
              </h2>
            )}
            {description && (
              <div className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {description}
              </div>
            )}
          </div>
          <button
            className="text-muted-foreground hover:text-foreground text-xl focus:outline-none transition-colors"
            onClick={onClose}
            aria-label="Close dialog"
            tabIndex={0}
          >
            ×
          </button>
        </div>
        {/* Content */}
        <div
          className={`px-10 py-6 text-sm leading-normal overflow-y-auto min-h-0 ${footer ? 'mb-2' : 'mb-0'}`}
        >
          {children}
        </div>
        {/* Footer (optional) */}
        {footer && <div className="px-10 py-4 border-t border-border/50 shrink-0">{footer}</div>}
      </div>
    </div>
  );
};
