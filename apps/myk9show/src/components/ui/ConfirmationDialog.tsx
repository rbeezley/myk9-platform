import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ConfirmationVariant = 'default' | 'destructive' | 'warning' | 'success';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmationVariant;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmDisabled?: boolean;
  className?: string;
}

const variantConfig = {
  default: {
    icon: Info,
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    confirmButton: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
  },
  destructive: {
    icon: XCircle,
    iconColor: 'text-red-500',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    confirmButton: 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    confirmButton: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-green-500',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    confirmButton: 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
  }
};

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  confirmDisabled = false,
  className,
}) => {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleCancel();
      }
    }}>
      <DialogContent className={cn(
        "max-w-md w-[90vw] p-0 overflow-hidden rounded-2xl border-0 shadow-2xl",
        "bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl",
        className
      )}>
        {/* Header with Icon */}
        <div className="p-8 pb-6 text-center">
          <div className={cn(
            "w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center",
            config.iconBg
          )}>
            <IconComponent className={cn("h-8 w-8", config.iconColor)} />
          </div>
          
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {title}
          </h2>
          
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 p-6 pt-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1 h-11 rounded-xl border-border/50 bg-background hover:bg-muted/80 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 transition-all duration-200"
          >
            {cancelLabel}
          </Button>
          
          <Button
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className={cn(
              "flex-1 h-11 rounded-xl text-white font-medium transition-all duration-200 shadow-lg",
              "hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
              config.confirmButton
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmationDialog;