import React from 'react';
import { Clock, Target, AlertTriangle, MapPin, Eye, Layers, Timer } from 'lucide-react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Badge } from '@/components/ui/badge';
import { useClassRequirements, type ClassRequirements } from '@/hooks/queries/useClassRequirements';
import { cn } from '@/lib/utils';

interface ClassRequirementsPanelProps {
  open: boolean;
  onClose: () => void;
  organization: string | null;
  element: string;
  level: string;
}

/** Icon color mappings for requirement cards. */
const iconColors = {
  blue: 'bg-blue-500/15 text-blue-500',
  red: 'bg-red-500/15 text-red-500',
  amber: 'bg-amber-500/15 text-amber-500',
  emerald: 'bg-emerald-500/15 text-emerald-500',
  purple: 'bg-purple-500/15 text-purple-500',
  slate: 'bg-slate-500/15 text-slate-500',
} as const;

interface RequirementCardProps {
  icon: React.ReactNode;
  colorClass: string;
  label: string;
  value: string | number;
  subtitle?: string | undefined;
}

function RequirementCard({ icon, colorClass, label, value, subtitle }: RequirementCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-start gap-3">
      <div
        className={cn(
          'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg',
          colorClass
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function buildTimeSubtitle(timeType: 'fixed' | 'range' | null): string | undefined {
  if (timeType === 'range') return 'Judge sets within range';
  return undefined;
}

/** Returns true if the requirements object has at least one card worth rendering. */
function hasAnyDisplayableData(req: ClassRequirements | null): boolean {
  if (!req) return false;
  return (
    !!req.time_limit_text ||
    !!req.hides ||
    (!!req.distractions && req.distractions !== '0') ||
    req.area_count > 1 ||
    req.has_blank ||
    req.timer_mode === 'dual' ||
    (req.odors != null && req.odors.length > 0)
  );
}

export const ClassRequirementsPanel: React.FC<ClassRequirementsPanelProps> = ({
  open,
  onClose,
  organization,
  element,
  level,
}) => {
  const { requirements, isLoading } = useClassRequirements({
    organization,
    element,
    level,
    enabled: open,
  });

  const headerActions = (
    <div className="flex items-center gap-1.5">
      {organization && (
        <Badge variant="outline" className="text-xs">
          {organization}
        </Badge>
      )}
      <Badge variant="secondary" className="text-xs">
        {element}
      </Badge>
      <Badge variant="secondary" className="text-xs">
        {level}
      </Badge>
    </div>
  );

  const footer = organization ? (
    <span className="text-xs text-muted-foreground">
      Source: {organization} Scent Work Regulations
    </span>
  ) : undefined;

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Class Requirements"
      size="md"
      headerActions={headerActions}
      footer={footer}
    >
      {isLoading ? (
        <div className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">Loading requirements...</p>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[72px] animate-pulse rounded-lg border bg-muted/50" />
            ))}
          </div>
        </div>
      ) : !requirements || !hasAnyDisplayableData(requirements) ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Layers className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No requirements found for this class configuration
          </p>
        </div>
      ) : (
        <div className="space-y-3 p-6">
          {/* Time Limit */}
          {requirements.time_limit_text && (
            <RequirementCard
              icon={<Clock className="h-4 w-4" />}
              colorClass={iconColors.blue}
              label="Time Limit"
              value={requirements.time_limit_text}
              subtitle={buildTimeSubtitle(requirements.time_type)}
            />
          )}

          {/* Hides */}
          {requirements.hides && (
            <RequirementCard
              icon={<Target className="h-4 w-4" />}
              colorClass={iconColors.red}
              label="Hides"
              value={requirements.hides}
              subtitle={
                requirements.hides_known
                  ? 'Number of hides known to handler'
                  : 'Number of hides unknown (blind)'
              }
            />
          )}

          {/* Distractions */}
          {requirements.distractions && requirements.distractions !== '0' && (
            <RequirementCard
              icon={<AlertTriangle className="h-4 w-4" />}
              colorClass={iconColors.amber}
              label="Distractions"
              value={requirements.distractions}
            />
          )}

          {/* Search Areas */}
          {requirements.area_count > 1 && (
            <RequirementCard
              icon={<MapPin className="h-4 w-4" />}
              colorClass={iconColors.purple}
              label="Search Areas"
              value={requirements.area_count}
            />
          )}

          {/* Has Blank */}
          {requirements.has_blank && (
            <RequirementCard
              icon={<Eye className="h-4 w-4" />}
              colorClass={iconColors.slate}
              label="Blank Area"
              value="Yes"
              subtitle="May include an area with no hides"
            />
          )}

          {/* Timer Mode */}
          {requirements.timer_mode === 'dual' && (
            <RequirementCard
              icon={<Timer className="h-4 w-4" />}
              colorClass={iconColors.emerald}
              label="Timer Mode"
              value="Dual Timer"
              subtitle="Search time and call time tracked separately"
            />
          )}

          {/* Odors */}
          {requirements.odors && requirements.odors.length > 0 && (
            <RequirementCard
              icon={<Target className="h-4 w-4" />}
              colorClass={iconColors.emerald}
              label="Odors"
              value={requirements.odors.join(', ')}
            />
          )}
        </div>
      )}
    </SlideOverPanel>
  );
};

export default ClassRequirementsPanel;
