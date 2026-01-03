import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
// Import removed: cn is not used in this component
import { SuccessConfirmationProps } from '@/types/optimistic-types';

export const SuccessConfirmation: React.FC<SuccessConfirmationProps> = ({
  message,
  showUndo = false,
  undoAction,
  duration = 5000
}) => {
  const [visible, setVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    if (!visible) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 100) {
          setVisible(false);
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [visible]);

  const handleDismiss = () => {
    setVisible(false);
  };

  const handleUndo = () => {
    if (undoAction) {
      undoAction();
    }
    setVisible(false);
  };

  const progressPercentage = (timeLeft / duration) * 100;

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden min-w-[320px] max-w-md"
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-100 ease-linear"
             style={{ width: `${progressPercentage}%` }} />
        
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
              >
                <CheckCircle className="w-6 h-6 text-green-500" />
              </motion.div>
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {message}
              </p>
            </div>
            
            <div className="flex-shrink-0 flex items-center gap-1">
              {showUndo && undoAction && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  className="h-8 px-2 text-xs hover:bg-muted/50"
                >
                  <Undo2 className="w-3 h-3 mr-1" />
                  Undo
                </Button>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-8 w-8 p-0 hover:bg-muted/50"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Specialized success confirmations
export const EntrySavedConfirmation: React.FC<{
  entryType: string;
  showUndo?: boolean;
  undoAction?: () => void;
}> = ({ entryType, showUndo, undoAction }) => (
  <SuccessConfirmation
    message={`${entryType} entry saved successfully`}
    showUndo={showUndo}
    undoAction={undoAction}
    duration={4000}
  />
);

export const ScoreSubmittedConfirmation: React.FC<{
  showUndo?: boolean;
  undoAction?: () => void;
}> = ({ showUndo, undoAction }) => (
  <SuccessConfirmation
    message="Score submitted successfully"
    showUndo={showUndo}
    undoAction={undoAction}
    duration={3000}
  />
);

export const BulkActionConfirmation: React.FC<{
  count: number;
  action: string;
  showUndo?: boolean;
  undoAction?: () => void;
}> = ({ count, action, showUndo, undoAction }) => (
  <SuccessConfirmation
    message={`${count} ${action} completed successfully`}
    showUndo={showUndo}
    undoAction={undoAction}
    duration={5000}
  />
);