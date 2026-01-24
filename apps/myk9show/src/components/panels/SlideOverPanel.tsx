import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SlideOverPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showBackButton?: boolean;
  onBack?: () => void;
  loading?: boolean;
  className?: string;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  preventClose?: boolean;
}

const sizeClasses = {
  sm: 'max-w-md w-full',
  md: 'max-w-lg w-full', 
  lg: 'max-w-2xl w-full',
  xl: 'max-w-4xl w-full',
};

// Apple-inspired design constants - solid, consistent with our design system
const appleDesign = {
  // Backdrop with subtle blur but solid panel
  backdropBlur: 'backdrop-blur-sm', // Lighter backdrop blur
  panelBackground: 'bg-card', // Solid card background - consistent with design system
  borderRadius: 'rounded-xl', // 12px radius from design tokens
  shadow: 'shadow-xl', // Strong shadow for depth
  headerBackground: 'bg-card', // Solid header background
  headerBorder: 'border-b border-border', // Clean separator
  footerBackground: 'bg-card', // Solid footer background
  footerBorder: 'border-t border-border', // Clean separator
  border: 'border-l border-border', // Subtle left border
  animation: {
    duration: 'duration-300', // Apple's preferred timing
    easing: 'ease-[cubic-bezier(0.25,0.46,0.45,0.94)]', // Apple's easing
  },
  typography: {
    title: 'text-lg font-semibold tracking-tight', // Apple typography
    subtitle: 'text-sm font-medium text-muted-foreground',
  },
};

export const SlideOverPanel: React.FC<SlideOverPanelProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'lg',
  showBackButton = false,
  onBack,
  loading = false,
  className,
  headerActions,
  footer,
  preventClose = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  // Initialize mounted to true - portal is always ready in modern React
  const [mounted] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  // Track open prop changes using render-time sync for animation state
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setIsAnimating(true);
    }
  }

  // Handle focus management and cleanup animations
  useEffect(() => {
    if (open) {
      // Focus management - focus the panel container first, then first input
      const timer = setTimeout(() => {
        if (panelRef.current) {
          // Focus the first focusable element in the panel
          const firstFocusable = panelRef.current.querySelector(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
          ) as HTMLElement;
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            panelRef.current.focus();
          }
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Handle escape key and focus trapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open || !panelRef.current) return;

      if (e.key === 'Escape' && !preventClose) {
        onClose();
        return;
      }

      // Focus trap: handle Tab key
      if (e.key === 'Tab') {
        const focusableElements = panelRef.current.querySelectorAll(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0] as HTMLElement;
        const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          // Shift+Tab: if focused on first element, go to last
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable?.focus();
          }
        } else {
          // Tab: if focused on last element, go to first
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable?.focus();
          }
        }
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [open, onClose, preventClose]);

  // Handle backdrop click with more precise event handling
  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself, not child elements
    if (e.target === e.currentTarget && !preventClose) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  if (!mounted || (!open && !isAnimating)) {
    return null;
  }

  const panelContent = (
    <div
      className={cn(
        // Clean backdrop - consistent with our design system
        'fixed inset-0 z-50 bg-black/50',
        appleDesign.backdropBlur,
        // Apple's signature animation timing
        `transition-all ${appleDesign.animation.duration} ${appleDesign.animation.easing}`,
        open ? 'opacity-100' : 'opacity-0'
      )}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="panel-title"
    >
      {/* Desktop: Slide from right */}
      <div
        className={cn(
          // Solid panel - consistent with our design system
          'fixed inset-y-0 right-0 flex flex-col slide-over-panel',
          // Solid background matching our card system
          appleDesign.panelBackground,
          // Apple-style border and shadow
          appleDesign.border,
          appleDesign.shadow,
          // Corner radius for visual polish
          'rounded-l-xl',
          // Size classes
          sizeClasses[size],
          // Mobile: Full screen on small devices
          'sm:max-w-none sm:w-full sm:rounded-none md:max-w-lg md:rounded-l-xl lg:max-w-2xl xl:max-w-4xl',
          // Animation - remove transform when open to prevent stacking context issues
          // (transforms create new containing blocks that break Select dropdown positioning)
          `transition-all ${appleDesign.animation.duration} ${appleDesign.animation.easing}`,
          open ? '' : 'translate-x-full',
          className
        )}
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => {
          // Prevent clicks within the panel from closing it via backdrop handler
          e.stopPropagation();
        }}
      >
        {/* Clean Header - consistent with design system */}
        <div className={cn(
          'flex-shrink-0',
          appleDesign.headerBackground,
          appleDesign.headerBorder
        )}>
          <div className="flex items-center justify-between px-6 py-5"> {/* Increased padding for Apple spacing */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {showBackButton && onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="gap-1 -ml-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              <div className="min-w-0 flex-1">
                <h2 
                  id="panel-title"
                  className={appleDesign.typography.title}
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className={appleDesign.typography.subtitle}>
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              {headerActions}
              {!preventClose && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0"
                  aria-label="Close panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            children
          )}
        </div>

        {/* Clean Footer - consistent with design system */}
        {footer && (
          <div className={cn(
            'flex-shrink-0 px-6 py-4',
            appleDesign.footerBackground,
            appleDesign.footerBorder
          )}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // Render directly - fixed positioning handles layering, and this allows
  // Base UI components (Select, etc.) to work properly with their own portals
  return panelContent;
};

export default SlideOverPanel;