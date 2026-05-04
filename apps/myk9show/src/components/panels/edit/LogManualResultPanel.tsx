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

const SPORT_TYPES = ['Scent Work', 'Obedience', 'Agility', 'Conformation'] as const;
type SportType = (typeof SPORT_TYPES)[number];

const SPORT_CODE_TO_SPORT: Record<string, SportType> = {
  'akc-scent-work': 'Scent Work',
  'ukc-nosework': 'Scent Work',
  'asca-scent-detection': 'Scent Work',
};

const SPORT_CODE_TO_ORG: Record<string, string> = {
  'akc-scent-work': 'AKC',
  'ukc-nosework': 'UKC',
  'asca-scent-detection': 'ASCA',
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
  sportType: z.string().min(1, 'Sport is required'),
  sportTemplateId: z.string().min(1, 'Organization is required'),
  showName: z.string().min(1, 'Show name is required'),
  trialDate: z.string().min(1, 'Trial date is required'),
  element: z.string().min(1, 'Element is required'),
  level: z.string().min(1, 'Level is required'),
  resultStatus: z.enum(['qualified', 'nq', 'absent', 'excused', 'withdrawn']),
  judge: z.string().optional(),
  location: z.string().optional(),
  searchTimeSec: z.string().optional(),
  notes: z.string().optional(),
});

type LogResultFormData = z.infer<typeof logResultSchema>;

// ── Form fields (uses panel context) ────────────────────────────────────────

const LogResultForm: React.FC = () => {
  const { form } = useEditPanel<LogResultFormData>();
  const { data: templates = [] } = useSportTemplatesQuery();

  const selectedTemplateId = form?.data.sportTemplateId;
  const selectedSportType = form?.data.sportType as SportType | '';

  // Templates available for the selected sport type
  const filteredTemplates = useMemo(
    () =>
      selectedSportType
        ? templates.filter(t => SPORT_CODE_TO_SPORT[t.sport_code] === selectedSportType)
        : [],
    [templates, selectedSportType]
  );

  const selectedTemplate = useMemo(
    () => filteredTemplates.find(t => t.id === selectedTemplateId) ?? null,
    [filteredTemplates, selectedTemplateId]
  );

  // Compute org label from current value so the trigger always shows the name
  const selectedOrgLabel = useMemo(() => {
    if (!selectedTemplateId) return '';
    const t = templates.find(tmpl => tmpl.id === selectedTemplateId);
    return t ? (SPORT_CODE_TO_ORG[t.sport_code] ?? t.sport_code) : '';
  }, [templates, selectedTemplateId]);

  if (!form) return null;

  const hasTemplatesForSport = filteredTemplates.length > 0;

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Sport type */}
      <FormField label="Sport" fieldId="sportType" required error={form.getError('sportType')}>
        <Select
          value={form.data.sportType}
          onValueChange={val => {
            form.setValue('sportType', val);
            form.setValue('sportTemplateId', '');
            form.setValue('element', '');
            form.setValue('level', '');
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select sport" />
          </SelectTrigger>
          <SelectContent>
            {SPORT_TYPES.map(sport => (
              <SelectItem key={sport} value={sport}>
                {sport}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {/* Organization — only shown once sport is selected */}
      {form.data.sportType && (
        <FormField
          label="Organization"
          fieldId="sportTemplateId"
          required
          error={form.getError('sportTemplateId')}
          hint={
            !hasTemplatesForSport ? `No ${form.data.sportType} templates configured yet` : undefined
          }
        >
          <Select
            value={form.data.sportTemplateId}
            onValueChange={val => {
              form.setValue('sportTemplateId', val);
              form.setValue('element', '');
              form.setValue('level', '');
            }}
            disabled={!hasTemplatesForSport}
          >
            {/* Render label manually — SelectValue shows raw UUID when Content hasn't mounted */}
            <SelectTrigger>
              {selectedOrgLabel ? (
                <span className="text-sm">{selectedOrgLabel}</span>
              ) : (
                <SelectValue placeholder="Select organization" />
              )}
            </SelectTrigger>
            <SelectContent>
              {filteredTemplates.map(t => (
                <SelectItem
                  key={t.id}
                  value={t.id}
                  textValue={SPORT_CODE_TO_ORG[t.sport_code] ?? t.sport_code}
                >
                  {SPORT_CODE_TO_ORG[t.sport_code] ?? t.sport_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {/* Element + Level — only shown once an org template is selected */}
      {selectedTemplate && (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Element" fieldId="element" required error={form.getError('element')}>
            <Select value={form.data.element} onValueChange={val => form.setValue('element', val)}>
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
  sportType: '',
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
      organization: data.sportTemplateId,
      sport_template_id: data.sportTemplateId,
      show_name: data.showName,
      trial_date: data.trialDate,
      element: data.element,
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
