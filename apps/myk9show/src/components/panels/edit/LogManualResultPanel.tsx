import React, { useMemo } from 'react';
import { z } from 'zod';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSportTemplatesQuery } from '@/hooks/queries/useSportTemplates';
import { useCreateManualResultMutation } from '@/hooks/queries/useManualResultsDatabase';
import type { ManualResultStatus } from '@/types/manual-result-types';

// ── Constants ────────────────────────────────────────────────────────────────

const SPORT_CODE_TO_ORG: Record<string, string> = {
  'akc-scent-work': 'AKC',
  'ukc-nosework': 'UKC',
  'asca-scent-detection': 'ASCA',
};

const SPORT_CODE_TO_DISPLAY: Record<string, string> = {
  'akc-scent-work': 'Scent Work',
  'ukc-nosework': 'Nosework',
  'asca-scent-detection': 'Scent Detection',
};

const RESULT_LABELS: Record<ManualResultStatus, string> = {
  qualified: 'Qualified (Q)',
  nq: 'Not Qualified (NQ)',
  absent: 'Absent',
  excused: 'Excused',
  withdrawn: 'Withdrawn',
};

const today = new Date().toISOString().split('T')[0];

// ── Schema ──────────────────────────────────────────────────────────────────

const logResultSchema = z.object({
  organization: z.string().min(1, 'Organization is required'),
  sportTemplateId: z.string().min(1, 'Sport is required'),
  showName: z.string().min(1, 'Show name is required'),
  trialDate: z.string().min(1, 'Trial date is required'),
  element: z.string().optional(),
  level: z.string().min(1, 'Level is required'),
  resultStatus: z.enum(['qualified', 'nq', 'absent', 'excused', 'withdrawn']),
  judge: z.string().optional(),
  location: z.string().optional(),
  searchTimeSec: z.string().optional(),
  notes: z.string().optional(),
});

type LogResultFormData = z.infer<typeof logResultSchema>;

// ── Form fields ───────────────────────────────────────────────────────────────

const LogResultForm: React.FC = () => {
  const { form } = useEditPanel<LogResultFormData>();
  const { data: templates = [] } = useSportTemplatesQuery();

  const selectedOrg = form?.data.organization ?? '';
  const selectedTemplateId = form?.data.sportTemplateId ?? '';

  // Unique orgs derived from available templates
  const availableOrgs = useMemo(() => {
    const orgs = new Set<string>();
    templates.forEach(t => {
      const org = SPORT_CODE_TO_ORG[t.sport_code];
      if (org) orgs.add(org);
    });
    return [...orgs].sort();
  }, [templates]);

  // Templates for the selected org
  const orgTemplates = useMemo(
    () => templates.filter(t => SPORT_CODE_TO_ORG[t.sport_code] === selectedOrg),
    [templates, selectedOrg]
  );

  const selectedTemplate = useMemo(
    () => orgTemplates.find(t => t.id === selectedTemplateId) ?? null,
    [orgTemplates, selectedTemplateId]
  );

  // Compute sport display label from current template ID (avoids UUID-in-trigger bug)
  const selectedSportLabel = useMemo(() => {
    if (!selectedTemplateId) return '';
    const t = templates.find(tmpl => tmpl.id === selectedTemplateId);
    return t ? (SPORT_CODE_TO_DISPLAY[t.sport_code] ?? t.sport_code) : '';
  }, [templates, selectedTemplateId]);

  if (!form) return null;

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Organization */}
      <FormField
        label="Organization"
        fieldId="organization"
        required
        error={form.getError('organization')}
      >
        <Select
          value={form.data.organization}
          onValueChange={val => {
            form.setValue('organization', val);
            form.setValue('sportTemplateId', '');
            form.setValue('element', '');
            form.setValue('level', '');
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select organization" />
          </SelectTrigger>
          <SelectContent>
            {availableOrgs.map(org => (
              <SelectItem key={org} value={org}>
                {org}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {/* Sport — appears once org is selected */}
      {selectedOrg && (
        <FormField
          label="Sport"
          fieldId="sportTemplateId"
          required
          error={form.getError('sportTemplateId')}
        >
          <Select
            value={form.data.sportTemplateId}
            onValueChange={val => {
              form.setValue('sportTemplateId', val);
              form.setValue('element', '');
              form.setValue('level', '');
            }}
          >
            <SelectTrigger>
              {selectedSportLabel ? (
                <span className="text-sm">{selectedSportLabel}</span>
              ) : (
                <SelectValue placeholder="Select sport" />
              )}
            </SelectTrigger>
            <SelectContent>
              {orgTemplates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {SPORT_CODE_TO_DISPLAY[t.sport_code] ?? t.sport_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {/* Element + Level — appears once a sport template is selected.
          Element is only shown for scent-work-style sports (templates with elements). */}
      {selectedTemplate && (
        <div className={selectedTemplate.elements.length > 0 ? 'grid grid-cols-2 gap-4' : ''}>
          {selectedTemplate.elements.length > 0 && (
            <FormField label="Element" fieldId="element" required error={form.getError('element')}>
              <Select
                value={form.data.element ?? ''}
                onValueChange={val => form.setValue('element', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select element" />
                </SelectTrigger>
                <SelectContent>
                  {selectedTemplate.elements.map(el => (
                    <SelectItem key={el} value={el}>
                      {el}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <FormField label="Level" fieldId="level" required error={form.getError('level')}>
            <Select value={form.data.level} onValueChange={val => form.setValue('level', val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {selectedTemplate.levels.map(lv => (
                  <SelectItem key={lv} value={lv}>
                    {lv}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      )}

      {/* Result */}
      <FormField
        label="Result"
        fieldId="resultStatus"
        required
        error={form.getError('resultStatus')}
      >
        <Select
          value={form.data.resultStatus}
          onValueChange={val => form.setValue('resultStatus', val as ManualResultStatus)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select result" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RESULT_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {/* Show name + Date */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Show name" fieldId="showName" required error={form.getError('showName')}>
          <Input
            id="showName"
            value={form.data.showName}
            onChange={e => form.setValue('showName', e.target.value)}
            placeholder="e.g. AKC Scent Work Trial"
          />
        </FormField>

        <FormField
          label="Trial date"
          fieldId="trialDate"
          required
          error={form.getError('trialDate')}
        >
          <Input
            id="trialDate"
            type="date"
            value={form.data.trialDate}
            onChange={e => form.setValue('trialDate', e.target.value)}
          />
        </FormField>
      </div>

      {/* Judge + Location */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Judge" fieldId="judge" error={form.getError('judge')}>
          <Input
            id="judge"
            value={form.data.judge ?? ''}
            onChange={e => form.setValue('judge', e.target.value)}
            placeholder="Judge name"
          />
        </FormField>

        <FormField label="Location" fieldId="location" error={form.getError('location')}>
          <Input
            id="location"
            value={form.data.location ?? ''}
            onChange={e => form.setValue('location', e.target.value)}
            placeholder="City, State"
          />
        </FormField>
      </div>

      {/* Search time */}
      <FormField
        label="Search time (seconds)"
        fieldId="searchTimeSec"
        error={form.getError('searchTimeSec')}
        hint="Optional — enter time in seconds"
      >
        <Input
          id="searchTimeSec"
          type="number"
          min={0}
          step={0.01}
          value={form.data.searchTimeSec ?? ''}
          onChange={e => form.setValue('searchTimeSec', e.target.value)}
          placeholder="e.g. 45.2"
        />
      </FormField>

      {/* Notes */}
      <FormField label="Notes" fieldId="notes" error={form.getError('notes')}>
        <Textarea
          id="notes"
          value={form.data.notes ?? ''}
          onChange={e => form.setValue('notes', e.target.value)}
          placeholder="Optional notes about this run"
          rows={2}
        />
      </FormField>
    </div>
  );
};

// ── Panel ────────────────────────────────────────────────────────────────────

export interface LogManualResultPanelProps {
  open: boolean;
  onClose: () => void;
  dogId: string;
  ownerId: string;
}

const INITIAL_DATA: LogResultFormData = {
  organization: '',
  sportTemplateId: '',
  showName: '',
  trialDate: today,
  element: '',
  level: '',
  resultStatus: 'qualified',
  judge: '',
  location: '',
  searchTimeSec: '',
  notes: '',
};

const LogManualResultPanel: React.FC<LogManualResultPanelProps> = ({
  open,
  onClose,
  dogId,
  ownerId,
}) => {
  const createMutation = useCreateManualResultMutation();

  const handleSave = async (data: LogResultFormData) => {
    const searchTimeSec = data.searchTimeSec ? parseFloat(data.searchTimeSec) : null;
    await createMutation.mutateAsync({
      dog_id: dogId,
      owner_id: ownerId,
      organization: data.organization,
      sport_template_id: data.sportTemplateId,
      show_name: data.showName,
      trial_date: data.trialDate,
      element: data.element ?? '',
      level: data.level,
      section: null,
      result_status: data.resultStatus,
      search_time_seconds: Number.isFinite(searchTimeSec) ? searchTimeSec : null,
      placement: null,
      points_earned: 0,
      judge: data.judge || null,
      location: data.location || null,
      notes: data.notes || null,
      source: 'manual',
    });
  };

  return (
    <EditPanelWrapper
      open={open}
      onClose={onClose}
      title="Log Qualifying Result"
      subtitle="Record a result from a previous trial"
      schema={logResultSchema}
      initialData={INITIAL_DATA}
      onSave={handleSave}
      forceHasChanges
      saveLabel="Log Result"
      size="md"
    >
      <LogResultForm />
    </EditPanelWrapper>
  );
};

export default LogManualResultPanel;
