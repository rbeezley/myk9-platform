import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, FileText, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  createShowIncident,
  listShowIncidents,
  showIncidentsQueryKey,
} from '@/services/database/show-incidents';
import { getAnnouncementAuthor } from '@/types/announcement-types';
import {
  SHOW_INCIDENT_SEVERITIES,
  SHOW_INCIDENT_TYPES,
  formatIncidentType,
  type IncidentEntryOption,
  type IncidentJudgeOption,
  type ShowIncidentSeverity,
  type ShowIncidentType,
} from './showIncidents';

const DEFAULT_INCIDENT_TYPE: ShowIncidentType = 'dq';
const DEFAULT_INCIDENT_SEVERITY: ShowIncidentSeverity = 'reportable';
const NO_SELECTION_VALUE = 'none';

const SEVERITY_TEXT_CLASS: Record<ShowIncidentSeverity, string> = {
  note: 'text-muted-foreground',
  reportable: 'font-medium text-amber-700',
  urgent: 'font-semibold text-destructive',
};

interface IncidentLogCardProps {
  entries: IncidentEntryOption[];
  judges: IncidentJudgeOption[];
  showId: string;
}

function formatIncidentDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function IncidentLogCard({ entries, judges, showId }: IncidentLogCardProps) {
  const [incidentType, setIncidentType] = useState<ShowIncidentType>(DEFAULT_INCIDENT_TYPE);
  const [severity, setSeverity] = useState<ShowIncidentSeverity>(DEFAULT_INCIDENT_SEVERITY);
  const [selectedEntryId, setSelectedEntryId] = useState(NO_SELECTION_VALUE);
  const [selectedJudgeId, setSelectedJudgeId] = useState(NO_SELECTION_VALUE);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { user, userWithRoles } = useAuthContext();
  const author = getAnnouncementAuthor(user, userWithRoles, 'Secretary');
  const queryClient = useQueryClient();

  const incidentsQuery = useQuery({
    queryKey: showIncidentsQueryKey(showId),
    queryFn: () => listShowIncidents(showId),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!author.id) throw new Error('account-loading');
      return createShowIncident({
        actionTaken,
        createdBy: author.id,
        createdByName: author.name,
        description,
        entry: entries.find(entry => entry.id === selectedEntryId) ?? null,
        incidentType,
        judge: judges.find(judge => judge.id === selectedJudgeId) ?? null,
        severity,
        showId,
        summary,
      });
    },
    onSuccess: async () => {
      toast.success('Incident logged');
      resetForm();
      await queryClient.invalidateQueries({ queryKey: showIncidentsQueryKey(showId) });
    },
    onError: error => {
      if (!(error instanceof Error && error.message === 'account-loading')) {
        console.error('[show-incidents] create failed', error);
      }
      toast.error(
        error instanceof Error && error.message === 'account-loading'
          ? 'Hang on — still loading your account'
          : 'Could not log incident'
      );
    },
  });

  const incidents = incidentsQuery.data ?? [];
  const canSave = summary.trim().length > 0 && !createMutation.isPending;

  function resetForm() {
    setIncidentType(DEFAULT_INCIDENT_TYPE);
    setSeverity(DEFAULT_INCIDENT_SEVERITY);
    setSelectedEntryId(NO_SELECTION_VALUE);
    setSelectedJudgeId(NO_SELECTION_VALUE);
    setSummary('');
    setDescription('');
    setActionTaken('');
    setDetailsOpen(false);
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="incident-log-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="incident-log-title" className="text-base font-semibold">
            Incident log
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Permanent notes for bites, complaints, disqualifications, and follow-up reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={resetForm}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!canSave}
          >
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {createMutation.isPending ? 'Saving...' : 'Save incident'}
          </Button>
        </div>
      </div>

      {/*
        INTENT: Lead with Summary + Save so logging a bite or scratch is a calm
        one-tap operation, not a multi-field form (Secretary "Show day chaos" ->
        "I can handle this", docs/INTENT.md). The save gate keys off summary alone
        (see canSave), so every other field is genuinely optional and lives behind
        the collapsed "Add details" disclosure. Do not surface these fields by
        default — that re-creates the multi-step form this intentionally replaced.
      */}
      <div className="mt-4 space-y-2">
        <Label htmlFor="incident-summary">Short summary</Label>
        <Input
          id="incident-summary"
          value={summary}
          onChange={event => setSummary(event.target.value)}
          placeholder="Dog excused for disqualification"
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          Just a summary is enough to log it. Add details if you have a moment.
        </p>
      </div>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="mt-3">
        <CollapsibleTrigger className="w-auto justify-start gap-2 py-1 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline">
          <ChevronDown className="h-4 w-4 transition-transform" aria-hidden="true" />
          {detailsOpen ? 'Hide details' : 'Add details'}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label id="incident-type-label">Type</Label>
              <Select
                value={incidentType}
                onValueChange={value => setIncidentType(value as ShowIncidentType)}
              >
                <SelectTrigger aria-labelledby="incident-type-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHOW_INCIDENT_TYPES.map(type => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label id="incident-severity-label">Severity</Label>
              <Select
                value={severity}
                onValueChange={value => setSeverity(value as ShowIncidentSeverity)}
              >
                <SelectTrigger aria-labelledby="incident-severity-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHOW_INCIDENT_SEVERITIES.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label id="incident-entry-label">Entry / dog</Label>
              <Select value={selectedEntryId} onValueChange={setSelectedEntryId}>
                <SelectTrigger aria-labelledby="incident-entry-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION_VALUE}>No entry selected</SelectItem>
                  {entries.map(entry => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label id="incident-judge-label">Judge</Label>
              <Select value={selectedJudgeId} onValueChange={setSelectedJudgeId}>
                <SelectTrigger aria-labelledby="incident-judge-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION_VALUE}>No judge selected</SelectItem>
                  {judges.map(judge => (
                    <SelectItem key={judge.id} value={judge.id}>
                      {judge.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="incident-description">What happened</Label>
              <Textarea
                id="incident-description"
                value={description}
                onChange={event => setDescription(event.target.value)}
                rows={3}
                maxLength={5000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="incident-action">Action taken</Label>
              <Textarea
                id="incident-action"
                value={actionTaken}
                onChange={event => setActionTaken(event.target.value)}
                rows={3}
                maxLength={5000}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-4 border-t pt-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h4 className="text-sm font-medium">Recent incidents</h4>
        </div>
        {incidentsQuery.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading incident log...</p>
        ) : incidents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No incidents logged for this show.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {incidents.map(incident => (
              <li key={incident.id} className="rounded-md border px-3 py-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{incident.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatIncidentType(incident.incident_type)} ·{' '}
                      <span className={SEVERITY_TEXT_CLASS[incident.severity]}>
                        {incident.severity}
                      </span>
                      {incident.dog_name ? ` · ${incident.dog_name}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatIncidentDate(incident.occurred_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {incidents.some(incident => incident.severity === 'urgent') && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Urgent incident logged. Confirm required club or registry follow-up.
          </p>
        )}
      </div>
    </section>
  );
}
