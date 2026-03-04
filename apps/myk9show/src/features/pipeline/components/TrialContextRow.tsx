/**
 * TrialContextRow — Trial selector + trial-level stats in a single row.
 */

import { Zap, Grid3X3, CheckCircle, TrendingUp, Award } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatChip } from './StatChip';
import type { ContextStats } from '../mission-control-types';

/** Minimal trial shape — works with both ShowTrial and trialStore's SyncableTrial */
interface TrialLike {
  id: string;
  name?: string | undefined;
}

interface TrialContextRowProps {
  trials: TrialLike[];
  selectedTrial: TrialLike | null;
  onTrialChange: (trialId: string) => void;
  stats: ContextStats;
}

export const TrialContextRow: React.FC<TrialContextRowProps> = ({
  trials,
  selectedTrial,
  onTrialChange,
  stats,
}) => (
  <div className="flex items-center gap-4 rounded-xl bg-muted/20 border border-border/30 px-4 py-3">
    {/* Trial selector */}
    <div className="flex items-center gap-3 flex-shrink-0">
      <div className="p-1.5 bg-amber-500/15 rounded-lg">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <Select value={selectedTrial?.id ?? ''} onValueChange={onTrialChange}>
        <SelectTrigger className="w-[260px] border-border/60 bg-card">
          <div className="text-left">
            <div className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
              Trial
            </div>
            <SelectValue placeholder="Select a trial">
              {selectedTrial ? selectedTrial.name || 'Unnamed Trial' : undefined}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {trials.map(trial => (
            <SelectItem key={trial.id} value={trial.id}>
              {trial.name || 'Unnamed Trial'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Divider */}
    <div className="h-8 w-px bg-border/60 flex-shrink-0" />

    {/* Trial-level stats */}
    <div className="flex items-center gap-3 flex-wrap">
      <StatChip
        icon={<Zap className="h-3 w-3 text-primary" />}
        value={stats.trialCount}
        label="Trial"
        iconBgClass="bg-primary/15"
      />
      <StatChip
        icon={<Grid3X3 className="h-3 w-3 text-blue-400" />}
        value={stats.classCount}
        label="Classes"
        iconBgClass="bg-blue-500/15"
      />
      <StatChip
        icon={<CheckCircle className="h-3 w-3 text-green-400" />}
        value={`${stats.scoredCount}/${stats.totalEntries}`}
        label="Scored"
        iconBgClass="bg-green-500/15"
      />
      <StatChip
        icon={<TrendingUp className="h-3 w-3 text-purple-400" />}
        value={`${stats.percentComplete}%`}
        label="Complete"
        iconBgClass="bg-purple-500/15"
      />
      <StatChip
        icon={<Award className="h-3 w-3 text-emerald-400" />}
        value={stats.percentQualified !== null ? `${stats.percentQualified}%` : '–'}
        label="Qualified"
        iconBgClass="bg-emerald-500/15"
      />
    </div>
  </div>
);
