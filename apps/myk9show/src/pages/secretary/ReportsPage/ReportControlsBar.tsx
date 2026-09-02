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
import { getReportById, getReportsForRegistries } from '@/lib/reports/reportRegistry';
import type { ReportCategory, ReportDefinition } from '@/lib/reports/types';
import { getTrialRegistry, type RegistryId } from '@/features/registries';
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
  return trial.date ? `${base} · ${trial.date}` : base;
}

function formatClassOptionLabel(cls: {
  name: string;
  element: string;
  level: string;
  section: string;
}): string {
  return formatClassLabel(cls.element, cls.level, cls.name, cls.section) || 'Class';
}

function formatDogOptionLabel(dog: {
  callName: string;
  registeredName: string | null;
  armband: number | null;
}): string {
  const registered = dog.registeredName ? ` (${dog.registeredName})` : '';
  const armband = dog.armband != null ? ` · #${dog.armband}` : '';
  return `${dog.callName}${registered}${armband}`;
}

type TrialReportOption = {
  id: string;
  name: string;
  trial_number: number;
  date: string;
  registry_id?: string | null;
};

const KNOWN_REGISTRY_IDS: readonly RegistryId[] = ['AKC', 'UKC', 'ASCA'];

function getScopedRegistryIds(
  trials: readonly TrialReportOption[],
  trialId: string
): RegistryId[] | undefined {
  if (trials.length === 0) return undefined;

  const scopedTrials = trialId === 'all' ? trials : trials.filter(trial => trial.id === trialId);
  if (scopedTrials.length === 0) return undefined;

  const ids = new Set<RegistryId>();
  for (const trial of scopedTrials) {
    const normalized = getTrialRegistry(trial).id;
    if (!KNOWN_REGISTRY_IDS.includes(normalized as RegistryId)) {
      // An unexpected value should never hide a form. Leave the catalog
      // unfiltered until the data contract is corrected.
      return undefined;
    }
    ids.add(normalized as RegistryId);
  }
  return [...ids];
}

export interface OfficialPdfAction {
  disabled: boolean;
  isLoading: boolean;
  label: string;
  /** Why the button is disabled, said in a sentence rather than on the button. */
  disabledReason?: string | undefined;
  missingFieldLabels?: readonly string[] | undefined;
  onClick: () => void;
}

interface ReportControlsBarProps {
  reportType: string;
  trialId: string;
  classId: string;
  dogId: string;
  sortOrder: string;
  trials: TrialReportOption[];
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
  /** The dog list failed to load, so an empty `dogs` means unknown, not none. */
  dogsUnavailable?: boolean;
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

export function ReportControlsBar({
  reportType,
  trialId,
  classId,
  dogId,
  sortOrder,
  trials,
  classes,
  dogs,
  dogsUnavailable = false,
  onReportTypeChange,
  onTrialChange,
  onClassChange,
  onDogChange,
  onSortChange,
  onPrint,
  officialPdfAction,
}: ReportControlsBarProps) {
  const selectedReport = getReportById(reportType);
  const visibleReports = getReportsForRegistries(getScopedRegistryIds(trials, trialId), reportType);
  const reportsByCategory: Record<ReportCategory, ReportDefinition[]> = {
    operational: visibleReports.filter(r => r.category === 'operational'),
    organization: visibleReports.filter(r => r.category === 'organization'),
    financial: visibleReports.filter(r => r.category === 'financial'),
    statistics: visibleReports.filter(r => r.category === 'statistics'),
  };

  const hasTrialScope = selectedReport?.scopes.includes('trial') ?? false;
  const hasClassScope = selectedReport?.scopes.includes('class') ?? false;
  const hasDogFilter = selectedReport?.supportsDogFilter ?? false;
  const hasSortOptions = (selectedReport?.sortOptions.length ?? 0) > 0;

  const filteredClasses = trialId === 'all' ? classes : classes.filter(c => c.trial_id === trialId);

  // Base UI's SelectValue resolves the trigger label only from a currently-rendered
  // option; when the selected value has no matching mounted item (deep-link before
  // data loads, or a classId whose class is filtered out of the active trial) it
  // echoes the raw UUID `value`. The 2026-06-09 fix only corrected the open option
  // list — the collapsed trigger still printed UUIDs. Feed SelectValue an explicit
  // label resolved against the FULL list so a human name always shows. (Matches the
  // SimpleClassSelector / MessageShowComposer convention of passing explicit
  // SelectValue children.)
  const selectedTrialLabel =
    trialId === 'all'
      ? 'All Trials'
      : (() => {
          const trial = trials.find(t => t.id === trialId);
          return trial ? formatTrialOptionLabel(trial) : 'All Trials';
        })();
  const selectedClassLabel =
    classId === 'all'
      ? 'All Classes'
      : (() => {
          const cls = classes.find(c => c.id === classId);
          return cls ? formatClassOptionLabel(cls) : 'All Classes';
        })();
  const selectedDogLabel =
    dogId === 'all'
      ? 'All Dogs'
      : (() => {
          const dog = dogs.find(d => d.id === dogId);
          return dog ? formatDogOptionLabel(dog) : 'All Dogs';
        })();
  // The report-type and sort triggers had the same raw-id echo as the
  // trial/class/dog triggers did before 2026-06-09: their option ids are
  // kebab-case strings (`check-in-sheet`, `run-order`), not UUIDs, but the
  // collapsed trigger still printed them. Resolve explicit human labels from the
  // report registry so the trigger always shows a name, falling back to the
  // placeholder text rather than the raw id.
  const selectedReportLabel = selectedReport?.name ?? 'Select report';
  const isPdfOnlyReport = selectedReport?.pdfOnly ?? false;
  const selectedSortLabel =
    selectedReport?.sortOptions.find(opt => opt.value === sortOrder)?.label ?? 'Sort by';

  return (
    <div className="flex flex-col items-stretch gap-3 border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end">
      {/* Report Type */}
      <div className="flex min-w-0 flex-col gap-1 sm:w-auto">
        <label htmlFor="report-type-select" className="text-xs font-medium text-muted-foreground">
          Report
        </label>
        <Select value={reportType} onValueChange={onReportTypeChange}>
          <SelectTrigger id="report-type-select" className="h-10 w-full sm:w-[200px]">
            <SelectValue placeholder="Select report">{selectedReportLabel}</SelectValue>
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
        <div className="flex min-w-0 flex-col gap-1 sm:w-auto">
          <label htmlFor="trial-select" className="text-xs font-medium text-muted-foreground">
            Trial
          </label>
          <Select value={trialId} onValueChange={onTrialChange}>
            <SelectTrigger id="trial-select" className="h-10 w-full sm:w-[160px]">
              <SelectValue placeholder="All Trials">{selectedTrialLabel}</SelectValue>
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
        <div className="flex min-w-0 flex-col gap-1 sm:w-auto">
          <label htmlFor="class-select" className="text-xs font-medium text-muted-foreground">
            Class
          </label>
          <Select value={classId} onValueChange={onClassChange} disabled={trialId === 'all'}>
            <SelectTrigger id="class-select" className="h-10 w-full sm:w-[200px]">
              <SelectValue placeholder="All Classes">{selectedClassLabel}</SelectValue>
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
        <div className="flex min-w-0 flex-col gap-1 sm:w-auto">
          <label htmlFor="dog-select" className="text-xs font-medium text-muted-foreground">
            Dog
          </label>
          <Select value={dogId} onValueChange={onDogChange}>
            <SelectTrigger id="dog-select" className="h-10 w-full sm:w-[240px]">
              <SelectValue placeholder="All Dogs">{selectedDogLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dogs</SelectItem>
              {dogs.map(dog => (
                <SelectItem key={dog.id} value={dog.id}>
                  {formatDogOptionLabel(dog)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dogsUnavailable && (
            <p className="text-xs text-destructive" role="alert">
              The dog list could not be loaded, so this filter is empty. It is not that this show
              has no dogs.
            </p>
          )}
        </div>
      )}

      {/* Sort dropdown — hidden if report has no sortOptions */}
      {hasSortOptions && selectedReport && (
        <div className="flex min-w-0 flex-col gap-1 sm:w-auto">
          <label htmlFor="sort-select" className="text-xs font-medium text-muted-foreground">
            Sort
          </label>
          <Select value={sortOrder} onValueChange={onSortChange}>
            <SelectTrigger id="sort-select" className="h-10 w-full sm:w-[160px]">
              <SelectValue placeholder="Sort by">{selectedSortLabel}</SelectValue>
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

      {/* Action group — separated from the filter dropdowns above. On mobile the
          controls stack into one column, so a top border keeps "what to print"
          (filters) visually distinct from "print it" (actions). On desktop the
          group sits inline at the end of the wrapped row. */}
      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end sm:border-t-0 sm:pt-0 sm:ml-auto">
        {/* Hidden, not disabled, for download-only registry forms: there is no
            HTML page to send to a printer, so the button could only ever print
            a blank sheet. A disabled Print sitting beside an enabled Download
            would still read as "printing is the main action, and it is broken". */}
        {!isPdfOnlyReport && (
          <Button onClick={onPrint} className="w-full sm:w-auto">
            Print
          </Button>
        )}
        {officialPdfAction && (
          <Button
            type="button"
            variant="outline"
            onClick={officialPdfAction.onClick}
            disabled={officialPdfAction.disabled || officialPdfAction.isLoading}
            className="w-full sm:w-auto"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {officialPdfAction.isLoading ? 'Preparing PDF…' : officialPdfAction.label}
          </Button>
        )}
        {officialPdfAction?.disabledReason && (
          <p className="text-xs text-muted-foreground sm:self-center">
            {officialPdfAction.disabledReason}
          </p>
        )}
      </div>
      {officialPdfAction?.missingFieldLabels?.length ? (
        <Alert
          role="status"
          className="basis-full border-warning/30 bg-warning/10 [&>svg]:text-warning"
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
