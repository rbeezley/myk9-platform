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
import { reportRegistry, getReportById } from '@/lib/reports/reportRegistry';

interface ReportControlsBarProps {
  reportType: string;
  trialId: string;
  classId: string;
  sortOrder: string;
  trials: Array<{ id: string; trial_number: number; date: string }>;
  classes: Array<{
    id: string;
    element: string;
    level: string;
    section: string;
    trial_id: string;
  }>;
  onReportTypeChange: (value: string) => void;
  onTrialChange: (value: string) => void;
  onClassChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPrint: () => void;
}

const operationalReports = reportRegistry.filter(r => r.category === 'operational');
const organizationReports = reportRegistry.filter(r => r.category === 'organization');

export function ReportControlsBar({
  reportType,
  trialId,
  classId,
  sortOrder,
  trials,
  classes,
  onReportTypeChange,
  onTrialChange,
  onClassChange,
  onSortChange,
  onPrint,
}: ReportControlsBarProps) {
  const selectedReport = getReportById(reportType);

  const hasTrialScope = selectedReport?.scopes.includes('trial') ?? false;
  const hasClassScope = selectedReport?.scopes.includes('class') ?? false;
  const hasSortOptions = (selectedReport?.sortOptions.length ?? 0) > 0;

  const filteredClasses = trialId === 'all' ? classes : classes.filter(c => c.trial_id === trialId);

  return (
    <div className="flex items-end gap-3 flex-wrap border-b px-4 py-3">
      {/* Report Type */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Report</label>
        <Select value={reportType} onValueChange={onReportTypeChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select report" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Operational</SelectLabel>
              {operationalReports.map(report => (
                <SelectItem key={report.id} value={report.id} disabled={!report.enabled}>
                  {report.name}
                  {!report.enabled ? ' (Coming Soon)' : ''}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Organization</SelectLabel>
              {organizationReports.map(report => (
                <SelectItem key={report.id} value={report.id} disabled={!report.enabled}>
                  {report.name}
                  {!report.enabled ? ' (Coming Soon)' : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Trial dropdown — hidden if report doesn't have trial/class scope */}
      {(hasTrialScope || hasClassScope) && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Trial</label>
          <Select value={trialId} onValueChange={onTrialChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Trials" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trials</SelectItem>
              {trials.map(trial => (
                <SelectItem key={trial.id} value={trial.id}>
                  Trial {trial.trial_number} — {trial.date}
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
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {filteredClasses.map(cls => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.element} {cls.level}
                  {cls.section ? ` — ${cls.section}` : ''}
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
            <SelectTrigger className="w-[160px]">
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
    </div>
  );
}
