import { formatTrialLabel } from '@myk9/core';
import { formatFee } from '@/utils/format';
import type { ClassData } from './types/classTypes';
import type { Trial } from '@/components/trials/types/trial.types';
import { formatClassTitle, shouldShowSection } from './ClassDetailsMain.helpers';
import { StatusIcon, getStatusDescriptor } from '@/components/status';
import { DetailHero, type HeroBadge } from '@/components/common/DetailHero';
import { NotSet } from '@/components/common/NotSet';
import { useClassEntryFee, type ClassFeeShow } from './useClassEntryFee';

// --- Facts row cell ---

interface MetadataItemProps {
  label: string;
  /** `null` is a blank the secretary should fill: it reads "Not set". */
  value: string | null;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div
      data-testid="metadata-item"
      className="flex-1 min-w-[120px] px-4 py-2.5 border-r border-border/50 last:border-r-0"
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value ?? <NotSet />}</div>
    </div>
  );
}

// --- Date formatting (matches ClassDetailsPage pattern) ---

function formatClassDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

// --- Main component ---

interface ClassCompactHeaderProps {
  classData: ClassData;
  parentTrial?: Trial | undefined;
  /** Required so the page cannot drop it: the fee shown depends on the show (MYK9-724 F52). */
  parentShow: ClassFeeShow | undefined;
  /** Page chrome kept beside the title (the class options menu); not page-level Edit. */
  actions?: React.ReactNode;
  className?: string;
}

export function ClassCompactHeader({
  classData,
  parentTrial,
  parentShow,
  actions,
  className,
}: ClassCompactHeaderProps) {
  const entryFee = useClassEntryFee(parentShow, classData.entryFee);
  // Build class display name from element + level (hides level for Detective)
  const classTitle = formatClassTitle(classData) || 'Class';

  // The one shared trial label (name, then trial number); trialType is the sport
  // (e.g., "Scent Work") which we don't want here. The trial is the hero's parent.
  const parent = parentTrial
    ? {
        label: formatTrialLabel({ name: parentTrial.name, trialNumber: parentTrial.trialNumber }),
        href: `/trials/${parentTrial.id}`,
      }
    : undefined;

  const status = getStatusDescriptor('class', classData.status);
  const badge: HeroBadge = {
    label: status.label,
    variant: 'default',
    icon: <StatusIcon family="class" status={classData.status} size="sm" decorative />,
  };

  // Owner decision 6: a field the secretary should fill reads "Not set"; an
  // optional blank field is hidden.
  const facts: MetadataItemProps[] = [
    { label: 'Judge', value: classData.judge || null },
    { label: 'Date', value: formatClassDate(classData.trialDate) },
    { label: 'Entry Fee', value: entryFee != null ? formatFee(entryFee) : null },
  ];
  if (classData.maxEntries != null) {
    facts.push({ label: 'Max Entries', value: String(classData.maxEntries) });
  }
  if (classData.timeLimit1) facts.push({ label: 'Time Limit', value: classData.timeLimit1 });
  if (classData.gateSteward) facts.push({ label: 'Gate Steward', value: classData.gateSteward });
  if (classData.tableSteward) {
    facts.push({ label: 'Table Steward', value: classData.tableSteward });
  }

  return (
    <DetailHero
      name={classTitle}
      headingLevel={1}
      parent={parent}
      subtitle={shouldShowSection(classData) ? `Section ${classData.section}` : undefined}
      badges={[badge]}
      secondaryActions={actions}
      footer={
        <div className="flex flex-wrap">
          {facts.map(field => (
            <MetadataItem key={field.label} label={field.label} value={field.value} />
          ))}
        </div>
      }
      {...(className ? { className } : {})}
    />
  );
}
