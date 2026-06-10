import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { reportRegistry, getReportById } from '@/lib/reports/reportRegistry';
import type { ReportCategory, ReportDefinition } from '@/lib/reports/types';
import { formatClassLabel } from '@/lib/utils';
import { AlertTriangle, Download } from 'lucide-react';

// Trial/class rows carry a non-null `name` (the canonical human label) plus
// nullable element/level/section/trial_number columns. Build the option label
// from the human fields and fall back to `name`, then to a generic label —
// never to the raw UUID `value`. (An empty SelectItem label makes shadcn's
// trigger echo the raw value — that was the "dropdowns show UUIDs" bug,
// TO-DOS 2026-06-09.) Both formatters carry a terminal fallback so the echo
// stays impossible even in the degenerate case where every human field is blank.
function formatTrialOptionLabel(trial: {
  name: string;
  trial_number: number;
  date: string;
}): string {
  const base = trial.name?.trim() || `Trial ${trial.trial_number}`;
  return trial.date ? `${base} — ${trial.date}` : base;
}

function formatClassOptionLabel(cls: {
  name: string;
  element: string;
  level: string;
  section: string;
}): string {
  return formatClassLabel(cls.element, cls.level, cls.name, cls.section) || 'Class';
}

interface OfficialPdfAction {
  disabled: boolean;
  isLoading: boolean;
  label: string;
  missingFieldLabels?: readonly string[] | undefined;
  onClick: () => void;
}

interface ReportControlsBarProps {
  reportType: string;
  trialId: string;
  classId: string;
  dogId: string;
  sortOrder: string;
  trials: Array<{ id: string; name: string; trial_number: number; date: string }>;
  classes: Array<{
    id: string;
    name: string;
    element: string;
    level: string;
    section: string;
    trial_id: string;
  }>;
  dogs: Array<{
    id: string;
    callName: string;
    registeredName: string | null;
    armband: number | null;
  }>;
  onReportTypeChange: (value: string) => void;
  onTrialChange: (value: string) => void;
  onClassChange: (value: string) => void;
  onDogChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPrint: () => void;
  officialPdfAction?: OfficialPdfAction | undefined;
}

// Order chosen so the most-used categories stay at the top of the dropdown.
// Adding a category to the `ReportCategory` union without extending this map
// fails TypeScript here, which prevents the kind of silent omission that
// hid Financial + Statistics for several weeks (fixed 2026-04-26).
const REPORT_GROUP_ORDER: ReadonlyArray<{ category: ReportCategory; label: string }> = [
  { category: 'operational', label: 'Operational' },
  { category: 'organization', label: 'Organization' },
  { category: 'financial', label: 'Financial' },
  { category: 'statistics', label: 'Statistics' },
];

const reportsByCategory: Record<ReportCategory, ReportDefinition[]> = {
  operational: reportRegistry.filter(r => r.category === 'operational'),
  organization: reportRegistry.filter(r => r.category === 'organization'),
  financial: reportRegistry.filter(r => r.category === 'financial'),
  statistics: reportRegistry.filter(r => r.category === 'statistics'),
};

export function ReportControlsBar({
  reportType,
  trialId,
  classId,
  dogId,
  sortOrder,
  trials,
  classes,
  dogs,
  onReportTypeChange,
  onTrialChange,
  onClassChange,
  onDogChange,
  onSortChange,
  onPrint,
  officialPdfAction,
}: ReportControlsBarProps) {
  const selectedReport = getReportById(reportType);

  const hasTrialScope = selectedReport?.scopes.includes('trial') ?? false;
  const hasClassScope = selectedReport?.scopes.includes('class') ?? false;
  const hasDogFilter = selectedReport?.supportsDogFilter ?? false;
  const hasSortOptions = (selectedReport?.sortOptions.length ?? 0) > 0;

  const filteredClasses = trialId === 'all' ? classes : classes.filter(c => c.trial_id === trialId);

  return (
    <div className="flex items-end gap-3 flex-wrap border-b px-4 py-3">
      {/* Report Type */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Report</label>
        <Select value={reportType} onValueChange={onReportTypeChange}>
          <SelectTrigger className="w-[200px]" aria-label="Select report">
            <SelectValue placeholder="Select report" />
          </SelectTrigger>
          <SelectContent>
            {REPORT_GROUP_ORDER.map(({ category, label }) => (
              <SelectGroup key={category}>
                <SelectLabel>{label}</SelectLabel>
                {reportsByCategory[category].map(report => (
                  <SelectItem key={report.id} value={report.id} disabled={!report.enabled}>
                    {report.name}
                    {!report.enabled ? ' (Coming Soon)' : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Trial dropdown — hidden if report doesn't have trial/class scope */}
      {(hasTrialScope || hasClassScope) && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Trial</label>
          <Select value={trialId} onValueChange={onTrialChange}>
            <SelectTrigger className="w-[160px]" aria-label="Select trial">
              <SelectValue placeholder="All Trials" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trials</SelectItem>
              {trials.map(trial => (
                <SelectItem key={trial.id} value={trial.id}>
                  {formatTrialOptionLabel(trial)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Class dropdown — hidden if report doesn't have class scope */}
      {hasClassScope && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Class</label>
          <Select value={classId} onValueChange={onClassChange} disabled={trialId === 'all'}>
            <SelectTrigger className="w-[200px]" aria-label="Select class">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {filteredClasses.map(cls => (
                <SelectItem key={cls.id} value={cls.id}>
                  {formatClassOptionLabel(cls)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Dog dropdown — hidden if report doesn't support dog filter */}
      {hasDogFilter && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Dog</label>
          <Select value={dogId} onValueChange={onDogChange}>
            <SelectTrigger className="w-[240px]" aria-label="Select dog">
              <SelectValue placeholder="All Dogs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dogs</SelectItem>
              {dogs.map(dog => (
                <SelectItem key={dog.id} value={dog.id}>
                  {dog.callName}
                  {dog.registeredName ? ` (${dog.registeredName})` : ''}
                  {dog.armband != null ? ` — #${dog.armband}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sort dropdown — hidden if report has no sortOptions */}
      {hasSortOptions && selectedReport && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Sort</label>
          <Select value={sortOrder} onValueChange={onSortChange}>
            <SelectTrigger className="w-[160px]" aria-label="Select sort">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {selectedReport.sortOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button onClick={onPrint} className="mb-0">
        Print
      </Button>
      {officialPdfAction && (
        <Button
          type="button"
          variant="outline"
          onClick={officialPdfAction.onClick}
          disabled={officialPdfAction.disabled || officialPdfAction.isLoading}
          className="mb-0"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {officialPdfAction.isLoading ? 'Preparing PDF' : officialPdfAction.label}
        </Button>
      )}
      {officialPdfAction?.missingFieldLabels?.length ? (
        <Alert
          role="status"
          className="basis-full border-warning-orange/30 bg-warning-orange/10 [&>svg]:text-warning-orange"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Official PDF needs a quick review</AlertTitle>
          <AlertDescription>
            Fill before submitting: {officialPdfAction.missingFieldLabels.join(', ')}. You can still
            download the PDF and complete those fields there.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
