import React from 'react';
import { Clock, Target, AlertTriangle, MapPin, MessageSquare, Ruler, Package } from 'lucide-react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Badge } from '@/components/ui/badge';
import { useClassRequirements } from '@/hooks/queries/useClassRequirements';
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
  pink: 'bg-pink-500/15 text-pink-500',
  slate: 'bg-slate-500/15 text-slate-500',
} as const;

interface RequirementCardProps {
  icon: React.ReactNode;
  colorClass: string;
  label: string;
  value: string | number;
  subtitle?: string;
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

function buildTimeSubtitle(
  timeType: 'fixed' | 'range' | 'dictated' | null,
  has30SecondWarning: boolean | null
): string | undefined {
  const parts: string[] = [];

  if (timeType === 'range') {
    parts.push('Range allowed');
  } else if (timeType === 'dictated') {
    parts.push('Dictated by organization');
  }

  if (has30SecondWarning === false) {
    parts.push('No 30-second warning');
  }

  return parts.length > 0 ? parts.join(' \u00b7 ') : undefined;
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

  const isUKC = organization === 'UKC';
  const showArrangement =
    element === 'Container' ||
    element === 'Buried' ||
    (element === 'Handler Discrimination' && level === 'Novice A');

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
      ) : !requirements ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground/50" />
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
              subtitle={buildTimeSubtitle(
                requirements.time_type,
                requirements.has_30_second_warning
              )}
            />
          )}

          {/* Hides */}
          {requirements.hides && (
            <RequirementCard
              icon={<Target className="h-4 w-4" />}
              colorClass={iconColors.red}
              label="Hides"
              value={requirements.hides}
            />
          )}

          {/* Distractions */}
          {requirements.distractions && (
            <RequirementCard
              icon={<AlertTriangle className="h-4 w-4" />}
              colorClass={iconColors.amber}
              label="Distractions"
              value={requirements.distractions}
            />
          )}

          {/* Area Size */}
          {requirements.area_size && (
            <RequirementCard
              icon={<MapPin className="h-4 w-4" />}
              colorClass={iconColors.emerald}
              label="Area Size"
              value={requirements.area_size}
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

          {/* Required Calls (AKC) / Final Response (UKC) */}
          {isUKC
            ? requirements.final_response && (
                <RequirementCard
                  icon={<MessageSquare className="h-4 w-4" />}
                  colorClass={iconColors.pink}
                  label="Final Response"
                  value={requirements.final_response}
                />
              )
            : requirements.required_calls && (
                <RequirementCard
                  icon={<MessageSquare className="h-4 w-4" />}
                  colorClass={iconColors.pink}
                  label="Required Calls"
                  value={requirements.required_calls}
                />
              )}

          {/* Max Height */}
          {requirements.height && requirements.height !== '-' && (
            <RequirementCard
              icon={<Ruler className="h-4 w-4" />}
              colorClass={iconColors.slate}
              label="Max Height"
              value={requirements.height}
            />
          )}

          {/* Arrangement */}
          {showArrangement && requirements.containers_items && (
            <RequirementCard
              icon={<Package className="h-4 w-4" />}
              colorClass={iconColors.slate}
              label="Arrangement"
              value={requirements.containers_items}
            />
          )}
        </div>
      )}
    </SlideOverPanel>
  );
};

export default ClassRequirementsPanel;
