import React from 'react';
import { Globe } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog/dialog';
import { productVersion, formattedBuildDate } from '@/config/appVersion';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AboutDialog: React.FC<AboutDialogProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 w-[72px] h-[72px] rounded-2xl bg-muted p-2 shadow-md border-2 border-border">
            <img
              src="/pwa-192x192.png"
              alt="myK9Show Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">myK9Show</DialogTitle>
          <DialogDescription className="text-primary font-semibold tracking-wide text-center">
            Show Management
          </DialogDescription>
        </DialogHeader>

        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">Version {productVersion}</p>
          <p className="text-xs text-muted-foreground/70">Build: {formattedBuildDate}</p>
        </div>

        {/* Links */}
        <a
          href="https://myk9t.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg text-primary text-sm font-medium hover:bg-accent transition-colors"
        >
          <Globe className="h-5 w-5" />
          <span>Visit myk9t.com</span>
        </a>

        {/* Copyright */}
        <div className="pt-3 border-t text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} myK9T. All rights reserved.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
