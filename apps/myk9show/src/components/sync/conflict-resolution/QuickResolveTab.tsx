import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ResolutionOption, ResolutionStrategy } from '../conflict-resolution-types';

interface QuickResolveTabProps {
  resolutionOptions: ResolutionOption[];
  onQuickResolve: (strategy: ResolutionStrategy) => void;
}

export function QuickResolveTab({ resolutionOptions, onQuickResolve }: QuickResolveTabProps) {
  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Choose a resolution strategy. We've analyzed the conflict and provided
          confidence scores for each option.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3">
        {resolutionOptions.map((option) => (
          <motion.div
            key={option.strategy}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start p-4 h-auto',
                option.recommended && 'border-primary bg-primary/5'
              )}
              onClick={() => onQuickResolve(option.strategy)}
            >
              <div className="flex items-start gap-3 w-full">
                <div className={cn(
                  'p-2 rounded-lg',
                  option.recommended ? 'bg-primary/10' : 'bg-muted'
                )}>
                  <option.icon className={cn(
                    'h-5 w-5',
                    option.recommended ? 'text-primary' : 'text-muted-foreground'
                  )} />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{option.label}</span>
                    {option.recommended && (
                      <Badge variant="secondary" className="text-xs">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {option.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">
                      Confidence:
                    </span>
                    <Progress value={option.confidence} className="h-1.5 w-20" />
                    <span className="text-xs font-medium">
                      {option.confidence}%
                    </span>
                  </div>
                </div>
              </div>
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
