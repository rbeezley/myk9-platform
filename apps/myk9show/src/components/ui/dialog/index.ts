// Export the original components that don't need enhancement
export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogDescription, DialogFooter } from './dialog';

// Export enhanced components with proper light/dark mode defaults
export { EnhancedDialogContent as DialogContent, EnhancedDialogHeader as DialogHeader, EnhancedDialogTitle as DialogTitle } from './enhanced-dialog';
