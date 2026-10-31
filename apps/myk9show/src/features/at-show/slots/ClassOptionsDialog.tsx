/**
 * ClassOptionsDialog — the umbrella menu for one class (MYK9-1502).
 *
 * INTENT: Requirements and Set Max Time lead, as the largest tiles, because they
 * are the judge's two main reasons to open this dialog (owner, 2026-10-29). Do not
 * reorder or shrink them to match the secondary tiles.
 *
 * Role gating is unchanged: each tile shows only when its callback is present and
 * its `hide*` flag is off, and any subset renders with no empty headings. Settings
 * stays hidden until MYK9-1515 gives it content. Printing is not offered at the
 * ring. Statistics opens ClassStatisticsDialog from the replicated entries.
 */
import { useId, useState } from 'react';
import type React from 'react';
import {
  BarChart3,
  ClipboardList,
  Clock,
  Flag,
  Layers,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { ClassOptionsDialogProps } from '@myk9/ringside';
import { cn } from '@/lib/utils';
import { useLiveClasses } from '../useLiveClasses';
import { ClassDialogShell } from './ClassDialogShell';
import { ClassStatisticsDialog } from './ClassStatisticsDialog';
import { setMaxTimeText } from './classRequirementsFromClass';

type Tone = 'primary' | 'class' | 'run';

const CHIP_TONE: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  class: 'bg-accent text-accent-foreground',
  run: 'bg-secondary text-secondary-foreground',
};

interface TileProps {
  icon: LucideIcon;
  title: string;
  tone: Tone;
  onClick: () => void;
  large?: boolean;
  /** Spans both columns, so a lone compact tile leaves no hole. */
  wide?: boolean;
  children: React.ReactNode;
}

const Tile: React.FC<TileProps> = ({ icon: Icon, title, tone, onClick, large, wide, children }) => {
  // The tile's name is its title; the description is read as its description.
  const descriptionId = useId();
  return (
    <button
      type="button"
      aria-label={title}
      aria-describedby={descriptionId}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border bg-card text-left transition-colors',
        'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        large ? 'min-h-20 border-primary/30 p-4' : 'min-h-14 border-border p-3',
        wide && 'col-span-full'
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md',
          large ? 'h-11 w-11' : 'h-9 w-9',
          CHIP_TONE[tone]
        )}
      >
        <Icon aria-hidden className={large ? 'h-6 w-6' : 'h-5 w-5'} />
      </span>
      <span className="min-w-0">
        <span
          className={cn('block font-semibold text-foreground', large ? 'text-base' : 'text-sm')}
        >
          {title}
        </span>
        <span id={descriptionId} className="block text-xs text-muted-foreground">
          {children}
        </span>
      </span>
    </button>
  );
};

/**
 * The host keeps this slot mounted while closed, so the body mounts fresh on every
 * open: reopening lands on the menu, never on a previous Statistics view.
 */
export const ClassOptionsDialog: React.FC<ClassOptionsDialogProps> = props =>
  props.isOpen ? <ClassOptionsBody {...props} /> : null;

const ClassOptionsBody: React.FC<ClassOptionsDialogProps> = ({
  onClose,
  classData,
  onRequirements,
  onSetMaxTime,
  onAreaCount,
  onStatistics,
  onStatus,
  hideRequirements,
  hideMaxTime,
  hideStatistics,
  hideStatus,
}) => {
  const [showStatistics, setShowStatistics] = useState(false);
  // Live: a max time saved on this or another device shows without reopening.
  const live = useLiveClasses(classData?.id ? [classData.id] : []);

  const name = classData ? classData.class_name : 'Class Options';
  if (showStatistics) {
    return (
      <ClassStatisticsDialog classId={classData?.id ?? ''} className={name} onClose={onClose} />
    );
  }

  const showRequirements = !hideRequirements && !!onRequirements;
  const showMaxTime = !hideMaxTime && !!onSetMaxTime;
  const showStatisticsTile = !hideStatistics && !!onStatistics;
  const showStatusTile = !hideStatus && !!onStatus;

  const showAreaCount = !!onAreaCount;
  const compactCount = Number(showStatisticsTile) + Number(showStatusTile) + Number(showAreaCount);
  const cls = live?.[0] ?? null;
  const savedMaxTime = cls ? setMaxTimeText(cls, !!classData?.per_area_times) : null;

  return (
    <ClassDialogShell
      icon={SlidersHorizontal}
      eyebrow="Class options"
      className={name}
      onClose={onClose}
    >
      {(showRequirements || showMaxTime) && (
        <div className="grid gap-3">
          {showRequirements && onRequirements && (
            <Tile
              large
              tone="primary"
              icon={ClipboardList}
              title="Requirements"
              onClick={onRequirements}
            >
              See the rules and time limits for this class
            </Tile>
          )}
          {showMaxTime && onSetMaxTime && (
            <Tile large tone="primary" icon={Clock} title="Set Max Time" onClick={onSetMaxTime}>
              {savedMaxTime === null ? (
                'Set the time limit for this class'
              ) : savedMaxTime === 'Not set' ? (
                <span className="font-semibold text-warning">Not set</span>
              ) : (
                `Max time ${savedMaxTime}`
              )}
            </Tile>
          )}
        </div>
      )}
      {showAreaCount && onAreaCount && (
        <Tile tone="class" icon={Layers} title="Search areas" onClick={onAreaCount} wide>
          {cls?.areaCount
            ? `${cls.areaCount} ${cls.areaCount === 1 ? 'area' : 'areas'} chosen`
            : 'Choose how many search areas this class has'}
        </Tile>
      )}
      {compactCount - Number(showAreaCount) > 0 && (
        // Two columns where they fit; one at about 320px. An odd last tile spans both.
        <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
          {showStatisticsTile && (
            <Tile
              wide={compactCount - Number(showAreaCount) === 1}
              tone="class"
              icon={BarChart3}
              title="Statistics"
              onClick={() => setShowStatistics(true)}
            >
              View class performance data
            </Tile>
          )}
          {showStatusTile && onStatus && (
            <Tile
              wide={compactCount - Number(showAreaCount) === 1}
              tone="run"
              icon={Flag}
              title="Status"
              onClick={onStatus}
            >
              Update class status
            </Tile>
          )}
        </div>
      )}
    </ClassDialogShell>
  );
};
