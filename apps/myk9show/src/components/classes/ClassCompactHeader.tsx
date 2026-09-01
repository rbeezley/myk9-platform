import { cn } from '@/lib/utils';
import { formatFee } from '@/utils/format';
import type { ClassData } from './types/classTypes';
import type { Trial } from '@/components/trials/types/trial.types';
import { formatClassTitle, shouldShowSection } from './ClassDetailsMain.helpers';
import { StatusBadge } from '@/components/status';

// --- Metadata item sub-component ---

interface MetadataItemProps {
  label: string;
  value: string;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div
      data-testid="metadata-item"
      className="flex-1 min-w-[120px] px-4 py-2.5 border-r border-border/50 last:border-r-0"
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

// --- Date formatting (matches ClassDetailsPage pattern) ---

function formatClassDate(dateStr: string | undefined): string {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? '\u2014' : d.toLocaleDateString();
}

// --- Main component ---

interface ClassCompactHeaderProps {
  classData: ClassData;
  parentTrial?: Trial | undefined;
  actions?: React.ReactNode;
  className?: string;
}

export function ClassCompactHeader({
  classData,
  parentTrial,
  actions,
  className,
}: ClassCompactHeaderProps) {
  // Build class display name from element + level (hides level for Detective)
  const className_ = formatClassTitle(classData) || 'Class';

  // Trial display value — trialNumber is the name (e.g., "Saturday Trial 1"),
  // trialType is the sport (e.g., "Scent Work") which we don't want here
  const trialDisplay = parentTrial?.trialNumber || parentTrial?.name || '\u2014';

  // Build metadata fields
  const metadataFields: MetadataItemProps[] = [
    { label: 'Judge', value: classData.judge || '\u2014' },
    { label: 'Trial', value: trialDisplay },
    { label: 'Date', value: formatClassDate(classData.trialDate) },
    {
      label: 'Entry Fee',
      value: classData.entryFee != null ? formatFee(classData.entryFee) : '\u2014',
    },
    {
      label: 'Max Entries',
      value: classData.maxEntries != null ? String(classData.maxEntries) : '\u2014',
    },
    { label: 'Time Limit', value: classData.timeLimit1 || '\u2014' },
  ];

  // Conditional officials
  if (classData.gateSteward) {
    metadataFields.push({ label: 'Gate Steward', value: classData.gateSteward });
  }
  if (classData.tableSteward) {
    metadataFields.push({ label: 'Table Steward', value: classData.tableSteward });
  }

  return (
    <div className={cn('rounded-xl border border-border/50 bg-card overflow-hidden', className)}>
      {/* Top row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">{className_}</h2>
            <StatusBadge
              family="class"
              status={classData.status}
              className="rounded-full px-2.5 py-0.5 text-sm font-medium"
            />
          </div>
          {shouldShowSection(classData) && (
            <div className="text-sm text-muted-foreground">Section {classData.section}</div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>

      {/* Metadata strip */}
      <div className="flex flex-wrap border-t border-border/50 bg-muted/30">
        {metadataFields.map(field => (
          <MetadataItem key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
    </div>
  );
}
