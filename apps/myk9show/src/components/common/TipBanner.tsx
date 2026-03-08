/**
 * TipBanner — Dismissible progressive tip banner (Phase 4.2).
 *
 * Slides in from the top, shows a contextual tip with optional CTA.
 * Once dismissed, the milestone is marked and the tip never shows again.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MilestoneTip } from '@/hooks/useMilestones';

interface TipBannerProps {
  tip: MilestoneTip;
  onDismiss: (milestoneKey: string) => void;
}

export const TipBanner: React.FC<TipBannerProps> = ({ tip, onDismiss }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/20 p-4 mb-4 animate-in slide-in-from-top-2 duration-300"
    >
      <Lightbulb className="h-5 w-5 text-primary mt-0.5 shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{tip.title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{tip.message}</p>
        {tip.cta && (
          <Button variant="link" size="sm" className="p-0 h-auto mt-1" asChild>
            <Link to={tip.cta.href}>{tip.cta.label}</Link>
          </Button>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 hover:bg-primary/10"
        onClick={() => onDismiss(tip.milestoneKey)}
        aria-label="Dismiss tip"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default TipBanner;
