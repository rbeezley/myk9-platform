import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  type SheetSize,
} from '@myk9/ui';

interface CommonSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleIcon?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: SheetSize;
}

export const CommonSheet: React.FC<CommonSheetProps> = ({
  open,
  onClose,
  title,
  titleIcon,
  description,
  children,
  footer,
  size = 'md',
}) => {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent size={size}>
        {(title || description) && (
          <SheetHeader>
            {title && (
              <SheetTitle className="flex items-center gap-3">
                {titleIcon && <span className="text-destructive">{titleIcon}</span>}
                {title}
              </SheetTitle>
            )}
            {description && (
              <SheetDescription>{description}</SheetDescription>
            )}
          </SheetHeader>
        )}
        <SheetBody>
          {children}
        </SheetBody>
        {footer && (
          <SheetFooter>
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
