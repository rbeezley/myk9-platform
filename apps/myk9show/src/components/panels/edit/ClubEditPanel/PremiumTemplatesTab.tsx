import { useState } from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useClubPremiumTemplates,
  useCreatePremiumTemplate,
  useUpdatePremiumTemplate,
  useDeletePremiumTemplate,
} from '../../../../hooks/queries/usePremiumTemplates';
import { useRecentPremiumGenerations } from '../../../../hooks/queries/usePremiumGenerations';
import { detectFrequentOverrides } from '../../../../features/premium/detectFrequentOverrides';
import type { ClubPremiumTemplate, PremiumStyle } from '../../../../types/premium-types';

interface Props {
  clubId: string;
  onClose: (() => void) | undefined;
}

const FIELD_LABELS: Record<string, string> = {
  vet_clinic: 'Vet Clinic',
  hospitality_notes: 'Hospitality',
  awards_description: 'Awards',
  additional_notes: 'Additional Notes',
  coverImageUrl: 'Cover Image',
  style: 'Style',
};

const STYLES: PremiumStyle[] = ['monogram', 'banner', 'headline'];

export function PremiumTemplatesTab({ clubId, onClose }: Props) {
  const { data: templates = [], isLoading } = useClubPremiumTemplates(clubId);
  const { data: recentGens = [] } = useRecentPremiumGenerations(clubId);
  const createMutation = useCreatePremiumTemplate(clubId);
  const updateMutation = useUpdatePremiumTemplate(clubId);
  const deleteMutation = useDeletePremiumTemplate(clubId);

  const [editing, setEditing] = useState<ClubPremiumTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const staleFields = detectFrequentOverrides(recentGens);

  const blank: Omit<ClubPremiumTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
    clubId,
    name: '',
    trialType: null,
    isDefault: false,
    style: 'monogram',
    vetClinicName: null,
    vetClinicAddress: null,
    vetClinicPhone: null,
    accommodations: [],
    coverImageUrl: null,
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  };
  const [form, setForm] = useState(blank);

  function openCreate() {
    setForm(blank);
    setCreating(true);
    setEditing(null);
  }

  function openEdit(t: ClubPremiumTemplate) {
    setForm({
      clubId: t.clubId,
      name: t.name,
      trialType: t.trialType,
      isDefault: t.isDefault,
      style: t.style,
      vetClinicName: t.vetClinicName,
      vetClinicAddress: t.vetClinicAddress,
      vetClinicPhone: t.vetClinicPhone,
      accommodations: t.accommodations,
      coverImageUrl: t.coverImageUrl,
      hospitalityNotes: t.hospitalityNotes,
      awardsDescription: t.awardsDescription,
      additionalNotes: t.additionalNotes,
    });
    setEditing(t);
    setCreating(false);
  }

  async function save() {
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, updates: form });
        setEditing(null);
      } else {
        await createMutation.mutateAsync(form);
        setCreating(false);
        onClose?.();
      }
    } catch {
      // error is captured in mutation.isError — rendered below
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading templates…</p>;

  return (
    <div className="space-y-4 p-4">
      {staleFields.length > 0 && (
        <Alert>
          <AlertDescription>
            You&apos;ve overridden {staleFields.map(f => FIELD_LABELS[f] ?? f).join(', ')} for your
            last 3 shows — consider updating your template.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Premium Templates</h3>
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="w-3 h-3 mr-1" /> New Template
        </Button>
      </div>

      {templates.map(t => (
        <div key={t.id} className="border rounded-md p-3 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{t.name}</span>
            {t.isDefault && (
              <Badge variant="secondary">
                <Star className="w-3 h-3 mr-1" />
                Default
              </Badge>
            )}
            {t.trialType && <Badge variant="outline">{t.trialType}</Badge>}
            <Badge variant="outline" className="capitalize">
              {t.style}
            </Badge>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={deleteMutation.isPending}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete template?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &quot;{t.name}&quot;. This action cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate(t.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {t.vetClinicName && (
            <p className="text-xs text-muted-foreground">
              {t.vetClinicName} · {t.vetClinicPhone}
            </p>
          )}
        </div>
      ))}

      {templates.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground">
          No templates yet. Create one to speed up premium generation.
        </p>
      )}

      {(creating || editing) && (
        <div className="border rounded-md p-4 space-y-3">
          <h4 className="font-medium text-sm">{editing ? 'Edit Template' : 'New Template'}</h4>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Scent Work"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trial Type (for auto-select)</Label>
              <Input
                value={form.trialType ?? ''}
                onChange={e => setForm(f => ({ ...f, trialType: e.target.value || null }))}
                placeholder="Scent Work"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Default Style</Label>
            <div className="flex gap-2">
              {STYLES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, style: s }))}
                  className={`flex-1 py-1.5 text-xs rounded border capitalize transition-colors ${
                    form.style === s
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Vet Clinic Name</Label>
            <Input
              value={form.vetClinicName ?? ''}
              onChange={e => setForm(f => ({ ...f, vetClinicName: e.target.value || null }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Vet Clinic Address</Label>
              <Input
                value={form.vetClinicAddress ?? ''}
                onChange={e => setForm(f => ({ ...f, vetClinicAddress: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vet Clinic Phone</Label>
              <Input
                value={form.vetClinicPhone ?? ''}
                onChange={e => setForm(f => ({ ...f, vetClinicPhone: e.target.value || null }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hospitality Notes</Label>
            <Textarea
              rows={2}
              value={form.hospitalityNotes ?? ''}
              onChange={e => setForm(f => ({ ...f, hospitalityNotes: e.target.value || null }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Awards Description</Label>
            <Textarea
              rows={2}
              value={form.awardsDescription ?? ''}
              onChange={e => setForm(f => ({ ...f, awardsDescription: e.target.value || null }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Additional Notes</Label>
            <Textarea
              rows={2}
              value={form.additionalNotes ?? ''}
              onChange={e => setForm(f => ({ ...f, additionalNotes: e.target.value || null }))}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-default"
              checked={form.isDefault}
              onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
            />
            <Label htmlFor="is-default" className="text-xs cursor-pointer">
              Use as default template
            </Label>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={!form.name || createMutation.isPending || updateMutation.isPending}
            >
              Save
            </Button>
          </div>
          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-xs text-destructive">Failed to save template. Please try again.</p>
          )}
        </div>
      )}
    </div>
  );
}
