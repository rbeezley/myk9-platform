import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PremiumButton } from './PremiumButton';

export interface BlurGateProps {
  locked: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function BlurGate({ locked, title, description, children, className }: BlurGateProps) {
  const navigate = useNavigate();

  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative overflow-hidden min-h-[240px]', className)}>
      <div className="blur-[4px] pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/65 text-center px-6">
        <div className="bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full p-5 shadow-lg">
          <Crown className="h-10 w-10 text-white" />
        </div>
        <div className="space-y-2 max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Premium Feature
          </p>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <PremiumButton
          variant="primary"
          icon={Crown}
          onClick={() => navigate('/pricing-page')}
          className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 mt-2"
        >
          Upgrade to Premium
        </PremiumButton>
      </div>
    </div>
  );
}

export default BlurGate;
