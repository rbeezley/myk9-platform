import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
// Import removed: cn is not used in this component
import { UndoToastProps } from '@/types/optimistic-types';

export const UndoToast: React.FC<UndoToastProps> = ({
  operationId,
  message,
  undoAction,
  timeout = 8000,
}) => {
  void operationId; // Suppress unused variable warning
  const [visible, setVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState(timeout);

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

  const handleUndo = () => {
    undoAction();
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  const progressPercentage = (timeLeft / timeout) * 100;

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-6 left-6 z-50 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden min-w-[300px] max-w-md"
      >
        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-1 bg-primary/60 transition-all duration-100 ease-linear"
          style={{ width: `${progressPercentage}%` }}
        />

        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{message}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.ceil(timeLeft / 1000)}s remaining
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                className="h-8 px-3 text-xs hover:bg-primary/10 hover:border-primary/40"
              >
                <Undo2 className="w-3 h-3 mr-1" />
                Undo
              </Button>

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

export const ScoreUpdatedToast: React.FC<{
  previousScore: number;
  newScore: number;
  undoAction: () => void;
}> = ({ previousScore, newScore, undoAction }) => (
  <UndoToast
    operationId=""
    message={`Score changed from ${previousScore} to ${newScore}`}
    undoAction={undoAction}
    timeout={6000}
  />
);
