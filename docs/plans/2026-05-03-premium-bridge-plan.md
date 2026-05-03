# Premium Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate org-compliant AKC/UKC premium PDFs from show data already in myK9Show, with per-club templates for supplemental fields (vet info, accommodations, hospitality) and correction logging for prompt improvement.

**Architecture:** Secretary clicks "Generate Premium" on ShowDetailsPage → edge function `generate-premium` fetches show + club template, calls Claude for narrative sections, returns `GeneratedPremium` JSON → client renders org-specific PDF via `@react-pdf/renderer` → secretary reviews overrides + downloads → correction log entry written to `premium_generations`.

**Tech Stack:** TypeScript, React, Supabase (Postgres + Edge Functions), Anthropic SDK (`claude-sonnet-4-6`), `@react-pdf/renderer`, Vitest, `@testing-library/react`

---

## Pre-Task: Environment Setup [ADDED]

**Files:** none — operational prerequisite

- [ ] **Step 1: Verify `ANTHROPIC_API_KEY` is set as a Supabase edge function secret**

```bash
npx supabase secrets list
```

Look for `ANTHROPIC_API_KEY` in the output. If it is absent, every call to `generate-premium` will catch the Anthropic SDK error and silently return placeholder narratives — the feature appears to work but Claude never runs.

```bash
# If missing:
npx supabase secrets set ANTHROPIC_API_KEY=<your-key>
```

Expected after setting: `npx supabase secrets list` shows `ANTHROPIC_API_KEY`.

- [ ] **Step 2: Verify `is_club_admin(uuid)` exists in the database**

```sql
-- Run in Supabase SQL editor or psql:
select proname from pg_proc where proname = 'is_club_admin';
```

If the query returns **no rows**, the migration in Task 1 will fail on push. In that case, replace all `public.is_club_admin(club_id)` references in `185_premium_bridge_tables.sql` with the known-safe fallback:

```sql
-- Safe fallback using confirmed-existing functions:
public.is_site_admin()
or public.is_trial_secretary(club_id)
```

---

## File Map

**New files:**
- `supabase/migrations/185_premium_bridge_tables.sql` — tables + RLS
- `supabase/functions/generate-premium/index.ts` — edge function
- `apps/myk9show/src/types/premium-types.ts` — shared types
- `apps/myk9show/src/features/premium/selectPremiumTemplate.ts` — auto-selection pure fn
- `apps/myk9show/src/features/premium/__tests__/selectPremiumTemplate.test.ts`
- `apps/myk9show/src/features/premium/detectConsecutiveOverrides.ts`
- `apps/myk9show/src/features/premium/__tests__/detectConsecutiveOverrides.test.ts`
- `apps/myk9show/src/services/database/queries/premiumTemplateQueries.ts`
- `apps/myk9show/src/hooks/queries/usePremiumTemplates.ts`
- `apps/myk9show/src/hooks/queries/usePremiumGenerations.ts`
- `apps/myk9show/src/features/premium/useGeneratePremium.ts`
- `apps/myk9show/src/features/premium/logPremiumGeneration.ts`
- `apps/myk9show/src/features/premium/pdf/AKCPremiumTemplate.tsx`
- `apps/myk9show/src/features/premium/pdf/UKCPremiumTemplate.tsx`
- `apps/myk9show/src/features/premium/pdf/__tests__/AKCPremiumTemplate.test.tsx`
- `apps/myk9show/src/features/premium/pdf/__tests__/UKCPremiumTemplate.test.tsx`
- `apps/myk9show/src/features/premium/GeneratePremiumPanel.tsx`
- `apps/myk9show/src/components/panels/edit/ClubEditPanel/PremiumTemplatesTab.tsx`

**Modified files:**
- `apps/myk9show/src/components/panels/edit/ClubEditPanel.tsx` — add Premium Templates tab
- `apps/myk9show/src/pages/ShowDetailsPage.tsx` — add Generate Premium button + panel

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/185_premium_bridge_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/185_premium_bridge_tables.sql
-- rollback: drop table public.premium_generations; drop table public.club_premium_templates;

create table public.club_premium_templates (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid not null references public.clubs(id) on delete cascade,
  name                text not null,
  trial_type          text,
  is_default          boolean not null default false,
  vet_clinic_name     text,
  vet_clinic_address  text,
  vet_clinic_phone    text,
  accommodations      jsonb not null default '[]',
  hospitality_notes   text,
  awards_description  text,
  additional_notes    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- only one default per club
create unique index club_premium_templates_default_unique
  on public.club_premium_templates(club_id)
  where is_default = true;

create index club_premium_templates_club_type
  on public.club_premium_templates(club_id, trial_type);

alter table public.club_premium_templates enable row level security;

create policy "club members can view premium templates"
  on public.club_premium_templates for select
  using (
    public.is_site_admin()
    or public.is_club_admin(club_id)
    or public.is_trial_secretary(club_id)
  );

create policy "club members can manage premium templates"
  on public.club_premium_templates for all
  using (
    public.is_site_admin()
    or public.is_club_admin(club_id)
    or public.is_trial_secretary(club_id)
  )
  with check (
    public.is_site_admin()
    or public.is_club_admin(club_id)
    or public.is_trial_secretary(club_id)
  );

-- correction log
create table public.premium_generations (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid not null references public.shows(id) on delete cascade,
  club_id         uuid not null references public.clubs(id),
  template_id     uuid references public.club_premium_templates(id),
  org             text not null check (org in ('AKC', 'UKC')),
  generated_at    timestamptz not null default now(),
  field_overrides jsonb not null default '{}',
  narrative_edits jsonb not null default '{}'
);

alter table public.premium_generations enable row level security;

create policy "club members can view premium generations"
  on public.premium_generations for select
  using (
    public.is_site_admin()
    or public.is_club_admin(club_id)
    or public.is_trial_secretary(club_id)
  );

create policy "club members can log premium generations"
  on public.premium_generations for insert
  with check (
    public.is_site_admin()
    or public.is_club_admin(club_id)
    or public.is_trial_secretary(club_id)
  );

-- index for consecutive-override detection query
create index premium_generations_club_generated
  on public.premium_generations(club_id, generated_at desc);
```

- [ ] **Step 2: Push migration**

```bash
cd /path/to/main/repo  # run from main worktree, not feature worktree
npx supabase db push --password "$(grep SUPABASE_DB_PASSWORD supabase/.env | cut -d= -f2)"
```

Expected: `Applying migration 185_premium_bridge_tables...` with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/185_premium_bridge_tables.sql
git commit -m "feat(premium-bridge): add club_premium_templates + premium_generations tables"
```

---

## Task 2: Types + Pure Logic (TDD)

**Files:**
- Create: `apps/myk9show/src/types/premium-types.ts`
- Create: `apps/myk9show/src/features/premium/selectPremiumTemplate.ts`
- Create: `apps/myk9show/src/features/premium/__tests__/selectPremiumTemplate.test.ts`
- Create: `apps/myk9show/src/features/premium/detectConsecutiveOverrides.ts`
- Create: `apps/myk9show/src/features/premium/__tests__/detectConsecutiveOverrides.test.ts`

- [ ] **Step 1: Write types**

```typescript
// apps/myk9show/src/types/premium-types.ts

export interface ClubPremiumTemplate {
  id: string
  clubId: string
  name: string
  trialType: string | null
  isDefault: boolean
  vetClinicName: string | null
  vetClinicAddress: string | null
  vetClinicPhone: string | null
  accommodations: Array<{ name: string; address: string; phone: string }>
  hospitalityNotes: string | null
  awardsDescription: string | null
  additionalNotes: string | null
  createdAt: string
  updatedAt: string
}

export interface PremiumSupplemental {
  vetClinic: { name: string; address: string; phone: string } | null
  accommodations: Array<{ name: string; address: string; phone: string }>
  hospitalityNotes: string | null
  awardsDescription: string | null
  additionalNotes: string | null
}

export interface GeneratedPremium {
  org: 'AKC' | 'UKC'
  templateId: string | null   // id of the club_premium_templates row used; null if none
  show: {
    name: string
    startDate: string
    endDate: string
    venue: string
    entryOpenDate: string | null
    entryCloseDate: string | null
    preEntryFee: number
    dayOfFee: number
    acceptChecks: boolean
    acceptCash: boolean
  }
  club: { name: string; logoUrl: string | null }
  secretary: {
    name: string | null
    email: string | null
    phone: string | null
    mailingAddress: string | null
  }
  officials: { chairman: string | null; steward: string | null }
  trials: Array<{
    name: string
    date: string
    startTime: string | null
    eventNumber: string | null
    type: string
    judges: Array<{ name: string; elements: string[] }>
    classes: Array<{ element: string; level: string; section: string | null }>
  }>
  supplemental: PremiumSupplemental
  narratives: {
    showHours: string
    trialInformation: string
  }
}

export interface PremiumFieldOverride {
  templateValue: unknown
  finalValue: unknown
}

export interface PremiumNarrativeEdit {
  generatedValue: string
  finalValue: string
}

export interface PremiumGeneration {
  id: string
  showId: string
  clubId: string
  templateId: string | null
  org: 'AKC' | 'UKC'
  generatedAt: string
  fieldOverrides: Record<string, PremiumFieldOverride>
  narrativeEdits: Record<string, PremiumNarrativeEdit>
}
```

- [ ] **Step 2: Write failing tests for selectPremiumTemplate**

```typescript
// apps/myk9show/src/features/premium/__tests__/selectPremiumTemplate.test.ts
import { describe, it, expect } from 'vitest'
import { selectPremiumTemplate } from '../selectPremiumTemplate'
import type { ClubPremiumTemplate } from '../../../types/premium-types'

const base: ClubPremiumTemplate = {
  id: 't1', clubId: 'c1', name: 'Test', trialType: null, isDefault: false,
  vetClinicName: null, vetClinicAddress: null, vetClinicPhone: null,
  accommodations: [], hospitalityNotes: null, awardsDescription: null,
  additionalNotes: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

describe('selectPremiumTemplate', () => {
  it('returns null when templates list is empty', () => {
    expect(selectPremiumTemplate([], 'Scent Work')).toBeNull()
  })

  it('matches by trial_type first', () => {
    const sw = { ...base, id: 'sw', trialType: 'Scent Work' }
    const def = { ...base, id: 'def', isDefault: true }
    expect(selectPremiumTemplate([def, sw], 'Scent Work')).toBe(sw)
  })

  it('falls back to default when no trial_type match', () => {
    const def = { ...base, id: 'def', isDefault: true }
    const ob = { ...base, id: 'ob', trialType: 'Obedience' }
    expect(selectPremiumTemplate([ob, def], 'Agility')).toBe(def)
  })

  it('returns null when no match and no default', () => {
    const ob = { ...base, id: 'ob', trialType: 'Obedience' }
    expect(selectPremiumTemplate([ob], 'Agility')).toBeNull()
  })

  it('returns null when trialType is null and no default exists', () => {
    const ob = { ...base, id: 'ob', trialType: 'Obedience' }
    expect(selectPremiumTemplate([ob], null)).toBeNull()
  })

  it('uses default when trialType is null', () => {
    const def = { ...base, id: 'def', isDefault: true }
    expect(selectPremiumTemplate([def], null)).toBe(def)
  })
})
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd apps/myk9show && npx vitest run src/features/premium/__tests__/selectPremiumTemplate.test.ts
```

Expected: `Cannot find module '../selectPremiumTemplate'`

- [ ] **Step 4: Implement selectPremiumTemplate**

```typescript
// apps/myk9show/src/features/premium/selectPremiumTemplate.ts
import type { ClubPremiumTemplate } from '../../types/premium-types'

export function selectPremiumTemplate(
  templates: ClubPremiumTemplate[],
  trialType: string | null,
): ClubPremiumTemplate | null {
  if (templates.length === 0) return null
  if (trialType) {
    const match = templates.find(t => t.trialType === trialType)
    if (match) return match
  }
  return templates.find(t => t.isDefault) ?? null
}
```

- [ ] **Step 5: Run to confirm pass**

```bash
cd apps/myk9show && npx vitest run src/features/premium/__tests__/selectPremiumTemplate.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 6: Write failing tests for detectConsecutiveOverrides**

```typescript
// apps/myk9show/src/features/premium/__tests__/detectConsecutiveOverrides.test.ts
import { describe, it, expect } from 'vitest'
import { detectConsecutiveOverrides } from '../detectConsecutiveOverrides'
import type { PremiumGeneration } from '../../../types/premium-types'

const makeGen = (fields: string[]): Pick<PremiumGeneration, 'fieldOverrides'> => ({
  fieldOverrides: Object.fromEntries(
    fields.map(f => [f, { templateValue: 'old', finalValue: 'new' }])
  ),
})

describe('detectConsecutiveOverrides', () => {
  it('returns empty array when no generations', () => {
    expect(detectConsecutiveOverrides([])).toEqual([])
  })

  it('returns field overridden 3+ times', () => {
    const gens = [makeGen(['vet_clinic']), makeGen(['vet_clinic']), makeGen(['vet_clinic'])]
    expect(detectConsecutiveOverrides(gens)).toContain('vet_clinic')
  })

  it('does not return field overridden fewer than threshold times', () => {
    const gens = [makeGen(['vet_clinic']), makeGen(['vet_clinic'])]
    expect(detectConsecutiveOverrides(gens)).not.toContain('vet_clinic')
  })

  it('respects custom threshold', () => {
    const gens = [makeGen(['vet_clinic']), makeGen(['vet_clinic'])]
    expect(detectConsecutiveOverrides(gens, 2)).toContain('vet_clinic')
  })

  it('handles multiple fields independently', () => {
    const gens = [
      makeGen(['vet_clinic', 'hospitality']),
      makeGen(['vet_clinic', 'hospitality']),
      makeGen(['vet_clinic']),
    ]
    const result = detectConsecutiveOverrides(gens)
    expect(result).toContain('vet_clinic')
    expect(result).not.toContain('hospitality')
  })
})
```

- [ ] **Step 7: Run to confirm failure**

```bash
cd apps/myk9show && npx vitest run src/features/premium/__tests__/detectConsecutiveOverrides.test.ts
```

- [ ] **Step 8: Implement detectConsecutiveOverrides**

```typescript
// apps/myk9show/src/features/premium/detectConsecutiveOverrides.ts
import type { PremiumGeneration } from '../../types/premium-types'

export function detectConsecutiveOverrides(
  generations: Array<Pick<PremiumGeneration, 'fieldOverrides'>>,
  threshold = 3,
): string[] {
  const counts: Record<string, number> = {}
  for (const gen of generations) {
    for (const field of Object.keys(gen.fieldOverrides)) {
      counts[field] = (counts[field] ?? 0) + 1
    }
  }
  return Object.entries(counts)
    .filter(([, count]) => count >= threshold)
    .map(([field]) => field)
}
```

- [ ] **Step 9: Run to confirm pass**

```bash
cd apps/myk9show && npx vitest run src/features/premium/__tests__/detectConsecutiveOverrides.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 10: Commit**

```bash
git add apps/myk9show/src/types/premium-types.ts apps/myk9show/src/features/premium/
git commit -m "feat(premium-bridge): types + selectPremiumTemplate + detectConsecutiveOverrides"
```

---

## Task 3: Supabase Queries + React Query Hooks

**Files:**
- Create: `apps/myk9show/src/services/database/queries/premiumTemplateQueries.ts`
- Create: `apps/myk9show/src/hooks/queries/usePremiumTemplates.ts`
- Create: `apps/myk9show/src/hooks/queries/usePremiumGenerations.ts`

- [ ] **Step 1: Write DB queries**

```typescript
// apps/myk9show/src/services/database/queries/premiumTemplateQueries.ts
import { supabase } from '@/lib/supabase'
import type { ClubPremiumTemplate, PremiumGeneration } from '../../../types/premium-types'

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToTemplate(row: Record<string, unknown>): ClubPremiumTemplate {
  return {
    id: row.id as string,
    clubId: row.club_id as string,
    name: row.name as string,
    trialType: row.trial_type as string | null,
    isDefault: row.is_default as boolean,
    vetClinicName: row.vet_clinic_name as string | null,
    vetClinicAddress: row.vet_clinic_address as string | null,
    vetClinicPhone: row.vet_clinic_phone as string | null,
    accommodations: (row.accommodations as ClubPremiumTemplate['accommodations']) ?? [],
    hospitalityNotes: row.hospitality_notes as string | null,
    awardsDescription: row.awards_description as string | null,
    additionalNotes: row.additional_notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function templateToRow(t: Partial<ClubPremiumTemplate>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (t.clubId !== undefined) row.club_id = t.clubId
  if (t.name !== undefined) row.name = t.name
  if (t.trialType !== undefined) row.trial_type = t.trialType
  if (t.isDefault !== undefined) row.is_default = t.isDefault
  if (t.vetClinicName !== undefined) row.vet_clinic_name = t.vetClinicName
  if (t.vetClinicAddress !== undefined) row.vet_clinic_address = t.vetClinicAddress
  if (t.vetClinicPhone !== undefined) row.vet_clinic_phone = t.vetClinicPhone
  if (t.accommodations !== undefined) row.accommodations = t.accommodations
  if (t.hospitalityNotes !== undefined) row.hospitality_notes = t.hospitalityNotes
  if (t.awardsDescription !== undefined) row.awards_description = t.awardsDescription
  if (t.additionalNotes !== undefined) row.additional_notes = t.additionalNotes
  return row
}

// ── queries ───────────────────────────────────────────────────────────────────

export async function fetchClubPremiumTemplates(clubId: string): Promise<ClubPremiumTemplate[]> {
  const { data, error } = await supabase
    .from('club_premium_templates')
    .select('*')
    .eq('club_id', clubId)
    .order('is_default', { ascending: false })
    .order('name')
  if (error) throw error
  return data.map(rowToTemplate)
}

export async function createClubPremiumTemplate(
  input: Omit<ClubPremiumTemplate, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ClubPremiumTemplate> {
  const { data, error } = await supabase
    .from('club_premium_templates')
    .insert(templateToRow(input))
    .select()
    .single()
  if (error) throw error
  return rowToTemplate(data)
}

export async function updateClubPremiumTemplate(
  id: string,
  updates: Partial<Omit<ClubPremiumTemplate, 'id' | 'clubId' | 'createdAt' | 'updatedAt'>>,
): Promise<ClubPremiumTemplate> {
  const { data, error } = await supabase
    .from('club_premium_templates')
    .update(templateToRow(updates))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return rowToTemplate(data)
}

export async function deleteClubPremiumTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('club_premium_templates').delete().eq('id', id)
  if (error) throw error
}

export async function fetchRecentPremiumGenerations(
  clubId: string,
  limit = 5,
): Promise<Pick<PremiumGeneration, 'fieldOverrides'>[]> {
  const { data, error } = await supabase
    .from('premium_generations')
    .select('field_overrides')
    .eq('club_id', clubId)
    .order('generated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data.map(row => ({ fieldOverrides: row.field_overrides ?? {} }))
}

export async function insertPremiumGeneration(
  gen: Omit<PremiumGeneration, 'id' | 'generatedAt'>,
): Promise<void> {
  const { error } = await supabase.from('premium_generations').insert({
    show_id: gen.showId,
    club_id: gen.clubId,
    template_id: gen.templateId,
    org: gen.org,
    field_overrides: gen.fieldOverrides,
    narrative_edits: gen.narrativeEdits,
  })
  if (error) throw error
}
```

- [ ] **Step 2: Write React Query hooks**

```typescript
// apps/myk9show/src/hooks/queries/usePremiumTemplates.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchClubPremiumTemplates,
  createClubPremiumTemplate,
  updateClubPremiumTemplate,
  deleteClubPremiumTemplate,
} from '../../services/database/queries/premiumTemplateQueries'
import type { ClubPremiumTemplate } from '../../types/premium-types'

const key = (clubId: string) => ['club_premium_templates', clubId]

export function useClubPremiumTemplates(clubId: string) {
  return useQuery({
    queryKey: key(clubId),
    queryFn: () => fetchClubPremiumTemplates(clubId),
    enabled: !!clubId,
  })
}

export function useCreatePremiumTemplate(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<ClubPremiumTemplate, 'id' | 'createdAt' | 'updatedAt'>) =>
      createClubPremiumTemplate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(clubId) }),
  })
}

export function useUpdatePremiumTemplate(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: {
      id: string
      updates: Partial<Omit<ClubPremiumTemplate, 'id' | 'clubId' | 'createdAt' | 'updatedAt'>>
    }) => updateClubPremiumTemplate(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(clubId) }),
  })
}

export function useDeletePremiumTemplate(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteClubPremiumTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(clubId) }),
  })
}
```

```typescript
// apps/myk9show/src/hooks/queries/usePremiumGenerations.ts
import { useQuery } from '@tanstack/react-query'
import { fetchRecentPremiumGenerations } from '../../services/database/queries/premiumTemplateQueries'

export function useRecentPremiumGenerations(clubId: string, limit = 5) {
  return useQuery({
    queryKey: ['premium_generations_recent', clubId, limit],
    queryFn: () => fetchRecentPremiumGenerations(clubId, limit),
    enabled: !!clubId,
  })
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep premium
```

Expected: no errors on premium files.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/services/database/queries/premiumTemplateQueries.ts \
        apps/myk9show/src/hooks/queries/usePremiumTemplates.ts \
        apps/myk9show/src/hooks/queries/usePremiumGenerations.ts
git commit -m "feat(premium-bridge): DB queries + React Query hooks for premium templates"
```

---

## Task 4: Club Settings — Premium Templates Tab

**Files:**
- Create: `apps/myk9show/src/components/panels/edit/ClubEditPanel/PremiumTemplatesTab.tsx`
- Modify: `apps/myk9show/src/components/panels/edit/ClubEditPanel.tsx`

- [ ] **Step 1: Create PremiumTemplatesTab**

```tsx
// apps/myk9show/src/components/panels/edit/ClubEditPanel/PremiumTemplatesTab.tsx
import { useState } from 'react'
import { Plus, Trash2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  useClubPremiumTemplates,
  useCreatePremiumTemplate,
  useUpdatePremiumTemplate,
  useDeletePremiumTemplate,
} from '../../../../hooks/queries/usePremiumTemplates'
import { useRecentPremiumGenerations } from '../../../../hooks/queries/usePremiumGenerations'
import { detectConsecutiveOverrides } from '../../../../features/premium/detectConsecutiveOverrides'
import type { ClubPremiumTemplate } from '../../../../types/premium-types'

interface Props { clubId: string }

const FIELD_LABELS: Record<string, string> = {
  vet_clinic: 'Vet Clinic',
  hospitality_notes: 'Hospitality',
  awards_description: 'Awards',
  additional_notes: 'Additional Notes',
}

export function PremiumTemplatesTab({ clubId }: Props) {
  const { data: templates = [], isLoading } = useClubPremiumTemplates(clubId)
  const { data: recentGens = [] } = useRecentPremiumGenerations(clubId)
  const createMutation = useCreatePremiumTemplate(clubId)
  const updateMutation = useUpdatePremiumTemplate(clubId)
  const deleteMutation = useDeletePremiumTemplate(clubId)
  const [editing, setEditing] = useState<ClubPremiumTemplate | null>(null)
  const [creating, setCreating] = useState(false)

  const staleFields = detectConsecutiveOverrides(recentGens)

  const blank: Omit<ClubPremiumTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
    clubId,
    name: '',
    trialType: null,
    isDefault: false,
    vetClinicName: null,
    vetClinicAddress: null,
    vetClinicPhone: null,
    accommodations: [],
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  }
  const [form, setForm] = useState(blank)

  function openCreate() {
    setForm(blank)
    setCreating(true)
    setEditing(null)
  }

  function openEdit(t: ClubPremiumTemplate) {
    setForm({
      clubId: t.clubId, name: t.name, trialType: t.trialType, isDefault: t.isDefault,
      vetClinicName: t.vetClinicName, vetClinicAddress: t.vetClinicAddress,
      vetClinicPhone: t.vetClinicPhone, accommodations: t.accommodations,
      hospitalityNotes: t.hospitalityNotes, awardsDescription: t.awardsDescription,
      additionalNotes: t.additionalNotes,
    })
    setEditing(t)
    setCreating(false)
  }

  async function save() {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, updates: form })
    } else {
      await createMutation.mutateAsync(form)
    }
    setEditing(null)
    setCreating(false)
  }

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading templates…</p>

  return (
    <div className="space-y-4 p-4">
      {staleFields.length > 0 && (
        <Alert>
          <AlertDescription>
            You&apos;ve overridden{' '}
            {staleFields.map(f => FIELD_LABELS[f] ?? f).join(', ')}{' '}
            for your last 3 shows — consider updating your template.
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
            {t.isDefault && <Badge variant="secondary"><Star className="w-3 h-3 mr-1" />Default</Badge>}
            {t.trialType && <Badge variant="outline">{t.trialType}</Badge>}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>Edit</Button>
              <Button
                size="sm" variant="ghost"
                onClick={() => deleteMutation.mutate(t.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
          {t.vetClinicName && (
            <p className="text-xs text-muted-foreground">{t.vetClinicName} · {t.vetClinicPhone}</p>
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
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Scent Work" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trial Type (for auto-select)</Label>
              <Input value={form.trialType ?? ''} onChange={e => setForm(f => ({ ...f, trialType: e.target.value || null }))} placeholder="Scent Work" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Vet Clinic Name</Label>
            <Input value={form.vetClinicName ?? ''} onChange={e => setForm(f => ({ ...f, vetClinicName: e.target.value || null }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Vet Clinic Address</Label>
              <Input value={form.vetClinicAddress ?? ''} onChange={e => setForm(f => ({ ...f, vetClinicAddress: e.target.value || null }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vet Clinic Phone</Label>
              <Input value={form.vetClinicPhone ?? ''} onChange={e => setForm(f => ({ ...f, vetClinicPhone: e.target.value || null }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hospitality Notes</Label>
            <Textarea rows={2} value={form.hospitalityNotes ?? ''} onChange={e => setForm(f => ({ ...f, hospitalityNotes: e.target.value || null }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Awards Description</Label>
            <Textarea rows={2} value={form.awardsDescription ?? ''} onChange={e => setForm(f => ({ ...f, awardsDescription: e.target.value || null }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Additional Notes</Label>
            <Textarea rows={2} value={form.additionalNotes ?? ''} onChange={e => setForm(f => ({ ...f, additionalNotes: e.target.value || null }))} />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-default"
              checked={form.isDefault}
              onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
            />
            <Label htmlFor="is-default" className="text-xs cursor-pointer">Use as default template</Label>
          </div>

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setEditing(null) }}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={!form.name}>Save</Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the tab to ClubEditPanel**

Open `apps/myk9show/src/components/panels/edit/ClubEditPanel.tsx`. Find where tabs are defined (look for `TabsList`, `TabsTrigger`, or a tabs array). Add a "Premium" tab entry and its content panel. The exact edit depends on the existing tab pattern — insert alongside the existing tabs:

```tsx
// Add import at top of ClubEditPanel.tsx
import { PremiumTemplatesTab } from './ClubEditPanel/PremiumTemplatesTab'

// Inside the TabsList, add:
<TabsTrigger value="premium">Premium</TabsTrigger>

// Inside the tab content area, add:
<TabsContent value="premium">
  <PremiumTemplatesTab clubId={clubId} />
</TabsContent>
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep -i premium
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/ClubEditPanel/PremiumTemplatesTab.tsx \
        apps/myk9show/src/components/panels/edit/ClubEditPanel.tsx
git commit -m "feat(premium-bridge): Premium Templates tab in Club edit panel"
```

---

## Task 5: Edge Function — generate-premium

**Files:**
- Create: `supabase/functions/generate-premium/index.ts`

- [ ] **Step 1: Write the edge function**

```typescript
// supabase/functions/generate-premium/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

  const supabase = createClient(supabaseUrl, serviceKey)
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  // verify caller is authenticated
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  const { show_id } = await req.json()
  if (!show_id) return jsonResponse({ error: 'show_id required' }, 400)

  // fetch show
  const { data: show, error: showError } = await supabase
    .from('shows')
    .select(`
      id, name, organization, start_date, end_date, location,
      entry_open_date, entry_close_date,
      pre_entry_fee, day_of_entry_fee,
      accept_check_payments, accept_cash_payments,
      club_id,
      clubs ( name, logo_url ),
      trials (
        id, name, date, planned_start_time, event_number, trial_type,
        judge_assignments ( judges: people ( id, first_name, last_name ) ),
        classes ( id, name, level, element, section )
      )
    `)
    .eq('id', show_id)
    .single()
  if (showError || !show) return jsonResponse({ error: 'Show not found' }, 404)

  // verify caller has rights — SECRETARY is scoped to this show's club [EXPANDED]
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('auth_user_id', user.id)
  const roleNames = (roles ?? []).map((r: { role: string }) => r.role)
  const isAdmin = roleNames.includes('SITE_ADMIN') || roleNames.includes('CLUB_ADMIN')

  let isSecretary = false
  if (!isAdmin && roleNames.includes('SECRETARY')) {
    const { data: secCheck } = await supabase
      .rpc('is_trial_secretary', { p_club_id: show.club_id })
    isSecretary = !!secCheck
  }

  if (!isAdmin && !isSecretary) return jsonResponse({ error: 'Forbidden' }, 403)

  // resolve club premium template
  const { data: templates } = await supabase
    .from('club_premium_templates')
    .select('*')
    .eq('club_id', show.club_id)
    .order('is_default', { ascending: false })

  const trialType = show.trials?.[0]?.trial_type ?? null
  const template = templates?.find((t: { trial_type: string | null }) => t.trial_type === trialType)
    ?? templates?.find((t: { is_default: boolean }) => t.is_default)
    ?? null

  // build Claude prompt
  const trialSummary = (show.trials ?? []).map((t: {
    name: string; date: string; planned_start_time: string | null; trial_type: string
  }) => `${t.name} on ${t.date}${t.planned_start_time ? ` starting ${t.planned_start_time}` : ''} (${t.trial_type})`).join('; ')

  const prompt = `You are generating narrative sections for a ${show.organization} dog show premium.

SHOW: ${show.name}
ORG: ${show.organization}
DATES: ${show.start_date} to ${show.end_date}
TRIALS: ${trialSummary}
ENTRY OPENS: ${show.entry_open_date ?? 'TBD'}, CLOSES: ${show.entry_close_date ?? 'TBD'}

Generate two sections as a JSON object with exactly these two keys:

"showHours": A single paragraph describing building open times, judging start times, and day-of-show entry windows. Use the trial dates and start times above. Be specific and factual — do not invent times not provided.

"trialInformation": A paragraph about participation rules appropriate for ${show.organization} ${trialType ?? 'trials'} — level progression requirements, move-up rules, and handler/dog eligibility. Use standard ${show.organization} rulebook language.

Return ONLY the JSON object. No other text.`

  const anthropic = new Anthropic({ apiKey: anthropicKey })
  let narratives = { showHours: '', trialInformation: '' }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    narratives = JSON.parse(text)
  } catch {
    // Claude error — return empty narratives, client will show partial premium warning
    narratives = {
      showHours: '[REQUIRED — add show hours before submitting]',
      trialInformation: '[REQUIRED — add trial information before submitting]',
    }
  }

  // assemble GeneratedPremium
  const club = show.clubs as { name: string; logo_url: string | null }
  const org = show.organization as 'AKC' | 'UKC'

  const generated = {
    org,
    show: {
      name: show.name,
      startDate: show.start_date,
      endDate: show.end_date,
      venue: show.location ?? '',
      entryOpenDate: show.entry_open_date,
      entryCloseDate: show.entry_close_date,
      preEntryFee: show.pre_entry_fee ?? 0,
      dayOfFee: show.day_of_entry_fee ?? 0,
      acceptChecks: show.accept_check_payments ?? false,
      acceptCash: show.accept_cash_payments ?? false,
    },
    club: { name: club?.name ?? '', logoUrl: club?.logo_url ?? null },
    secretary: { name: null, email: null, phone: null, mailingAddress: null },
    officials: { chairman: null, steward: null },
    trials: (show.trials ?? []).map((t: {
      name: string; date: string; planned_start_time: string | null
      event_number: string | null; trial_type: string
      judge_assignments: Array<{ judges: { first_name: string; last_name: string } }>
      classes: Array<{ element: string; level: string; section: string | null }>
    }) => ({
      name: t.name,
      date: t.date,
      startTime: t.planned_start_time,
      eventNumber: t.event_number,
      type: t.trial_type,
      judges: t.judge_assignments?.map(ja => ({
        name: `${ja.judges.first_name} ${ja.judges.last_name}`,
        elements: [],
      })) ?? [],
      classes: t.classes ?? [],
    })),
    supplemental: {
      vetClinic: template
        ? { name: template.vet_clinic_name ?? '', address: template.vet_clinic_address ?? '', phone: template.vet_clinic_phone ?? '' }
        : null,
      accommodations: template?.accommodations ?? [],
      hospitalityNotes: template?.hospitality_notes ?? null,
      awardsDescription: template?.awards_description ?? null,
      additionalNotes: template?.additional_notes ?? null,
    },
    narratives,
    templateId: template?.id ?? null,
  }

  return jsonResponse(generated)
})
```

- [ ] **Step 2: Deploy the function**

```bash
npx supabase functions deploy generate-premium --no-verify-jwt
```

Expected: `Deployed generate-premium`

- [ ] **Step 3: Smoke test via curl**

```bash
curl -X POST \
  https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/generate-premium \
  -H "Authorization: Bearer $(grep SUPABASE_ANON_KEY supabase/.env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"show_id":"<a real show id from your dev data>"}'
```

Expected: JSON response with `org`, `show`, `trials`, `supplemental`, `narratives` keys.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-premium/
git commit -m "feat(premium-bridge): generate-premium edge function"
```

---

## Task 6: Install @react-pdf/renderer + PDF Template Components (TDD)

**Files:**
- Modify: `apps/myk9show/package.json` (dependency added via pnpm)
- Create: `apps/myk9show/src/features/premium/pdf/AKCPremiumTemplate.tsx`
- Create: `apps/myk9show/src/features/premium/pdf/UKCPremiumTemplate.tsx`
- Create: `apps/myk9show/src/features/premium/pdf/__tests__/AKCPremiumTemplate.test.tsx`
- Create: `apps/myk9show/src/features/premium/pdf/__tests__/UKCPremiumTemplate.test.tsx`

- [ ] **Step 1: Install dependency**

```bash
cd apps/myk9show && pnpm add @react-pdf/renderer
```

- [ ] **Step 2: Write failing AKC template test**

> Before writing the template, study 2–3 real AKC premiums to confirm required section ordering. The UKC premium in `Downloads/CDST_NW_UKC_Premium_2026-05-08.pdf` is a good reference for UKC. AKC premiums follow a similar structure: header (club + org), dates/venue table, entry info, judges, trials, fees, supplemental.

```tsx
// apps/myk9show/src/features/premium/pdf/__tests__/AKCPremiumTemplate.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AKCPremiumTemplate } from '../AKCPremiumTemplate'
import type { GeneratedPremium } from '../../../../types/premium-types'

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => <div data-testid="pdf-document">{children}</div>,
  Page: ({ children }: { children: React.ReactNode }) => <div data-testid="pdf-page">{children}</div>,
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}))

const premium: GeneratedPremium = {
  org: 'AKC',
  show: {
    name: 'Spring Scent Trial',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    venue: '123 Main St, Tulsa, OK 74101',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2026-05-15',
    preEntryFee: 20,
    dayOfFee: 25,
    acceptChecks: true,
    acceptCash: false,
  },
  club: { name: 'Test Club', logoUrl: null },
  secretary: { name: 'Jane Smith', email: 'jane@test.com', phone: '918-555-1234', mailingAddress: '456 Oak Ave, Tulsa OK 74102' },
  officials: { chairman: 'Bob Jones', steward: null },
  trials: [{
    name: 'Saturday Trial 1', date: '2026-06-01', startTime: '9:00 AM',
    eventNumber: 'AKC-2026-001', type: 'Scent Work',
    judges: [{ name: 'Alice Judge', elements: ['Container', 'Interior'] }],
    classes: [{ element: 'Container', level: 'Novice', section: 'A' }],
  }],
  supplemental: {
    vetClinic: { name: 'Animal ER', address: '789 Vet Blvd', phone: '918-999-0000' },
    accommodations: [{ name: 'La Quinta', address: '100 Hotel Rd', phone: '918-111-2222' }],
    hospitalityNotes: 'Lunch on Saturday.',
    awardsDescription: 'Ribbons 1st–4th.',
    additionalNotes: null,
  },
  narratives: {
    showHours: 'Building opens at 8:00 AM.',
    trialInformation: 'Novice title required for Advanced.',
  },
}

describe('AKCPremiumTemplate', () => {
  it('renders the club name', () => {
    render(<AKCPremiumTemplate premium={premium} />)
    expect(screen.getAllByText('Test Club').length).toBeGreaterThan(0)
  })

  it('renders the show name', () => {
    render(<AKCPremiumTemplate premium={premium} />)
    expect(screen.getAllByText('Spring Scent Trial').length).toBeGreaterThan(0)
  })

  it('renders the pre-entry fee', () => {
    render(<AKCPremiumTemplate premium={premium} />)
    expect(screen.getByText(/\$20/)).toBeTruthy()
  })

  it('renders the judge name', () => {
    render(<AKCPremiumTemplate premium={premium} />)
    expect(screen.getByText(/Alice Judge/)).toBeTruthy()
  })

  it('renders vet clinic when present', () => {
    render(<AKCPremiumTemplate premium={premium} />)
    expect(screen.getByText(/Animal ER/)).toBeTruthy()
  })

  it('renders REQUIRED placeholder when vet clinic is null', () => {
    const p = { ...premium, supplemental: { ...premium.supplemental, vetClinic: null } }
    render(<AKCPremiumTemplate premium={p} />)
    expect(screen.getByText(/REQUIRED/)).toBeTruthy()
  })

  it('renders the show hours narrative', () => {
    render(<AKCPremiumTemplate premium={premium} />)
    expect(screen.getByText(/Building opens at 8:00 AM/)).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd apps/myk9show && npx vitest run src/features/premium/pdf/__tests__/AKCPremiumTemplate.test.tsx
```

Expected: `Cannot find module '../AKCPremiumTemplate'`

- [ ] **Step 4: Implement AKCPremiumTemplate**

```tsx
// apps/myk9show/src/features/premium/pdf/AKCPremiumTemplate.tsx
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { GeneratedPremium } from '../../../types/premium-types'

const PLACEHOLDER = '[REQUIRED — add before submitting]'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  header: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 4, textTransform: 'uppercase' },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { fontFamily: 'Helvetica-Bold', width: 120 },
  value: { flex: 1 },
  narrative: { lineHeight: 1.5, marginTop: 4 },
  placeholder: { color: '#cc0000', fontFamily: 'Helvetica-Oblique' },
  divider: { borderBottom: '1pt solid #333', marginVertical: 8 },
})

interface Props { premium: GeneratedPremium }

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>
      {value
        ? <Text style={styles.value}>{value}</Text>
        : <Text style={[styles.value, styles.placeholder]}>{PLACEHOLDER}</Text>
      }
    </View>
  )
}

export function AKCPremiumTemplate({ premium }: Props) {
  const { show, club, secretary, trials, supplemental, narratives } = premium

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {club.logoUrl && <Image src={club.logoUrl} style={{ width: 60, height: 60, marginBottom: 8 }} />}
          <Text style={styles.title}>{club.name}</Text>
          <Text style={styles.subtitle}>{show.name}</Text>
          <Text style={styles.subtitle}>{show.startDate} – {show.endDate}</Text>
          <Text style={styles.subtitle}>{show.venue}</Text>
        </View>

        <View style={styles.divider} />

        {/* Entry Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Entry Information</Text>
          <Field label="Entry Opens" value={show.entryOpenDate} />
          <Field label="Entry Closes" value={show.entryCloseDate} />
          <Field label="Pre-Entry Fee" value={show.preEntryFee ? `$${show.preEntryFee.toFixed(2)}` : null} />
          <Field label="Day-of Fee" value={show.dayOfFee ? `$${show.dayOfFee.toFixed(2)}` : null} />
          <Field label="Payment" value={[show.acceptChecks && 'Check', show.acceptCash && 'Cash'].filter(Boolean).join(', ') || null} />
          <Field label="Secretary" value={secretary.name} />
          {secretary.mailingAddress && <Field label="Mail Entries To" value={secretary.mailingAddress} />}
        </View>

        <View style={styles.divider} />

        {/* Trials + Judges */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trials &amp; Judges</Text>
          {trials.map((trial, i) => (
            <View key={i} style={{ marginBottom: 6 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{trial.name} — {trial.date}{trial.startTime ? ` at ${trial.startTime}` : ''}</Text>
              {trial.eventNumber && <Text>Event No: {trial.eventNumber}</Text>}
              {trial.judges.map((j, ji) => (
                <Text key={ji}>{j.name}{j.elements.length > 0 ? ` — ${j.elements.join(', ')}` : ''}</Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Show Hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Show Hours</Text>
          <Text style={styles.narrative}>{narratives.showHours || PLACEHOLDER}</Text>
        </View>

        {/* Trial Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trial Information</Text>
          <Text style={styles.narrative}>{narratives.trialInformation || PLACEHOLDER}</Text>
        </View>

        <View style={styles.divider} />

        {/* Supplemental */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Veterinary Information</Text>
          {supplemental.vetClinic
            ? <>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{supplemental.vetClinic.name}</Text>
                <Text>{supplemental.vetClinic.address}</Text>
                <Text>24-hour phone: {supplemental.vetClinic.phone}</Text>
              </>
            : <Text style={styles.placeholder}>{PLACEHOLDER}</Text>
          }
        </View>

        {supplemental.accommodations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accommodations</Text>
            {supplemental.accommodations.map((a, i) => (
              <Text key={i}>{a.name} — {a.address} {a.phone}</Text>
            ))}
          </View>
        )}

        {supplemental.hospitalityNotes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hospitality</Text>
            <Text style={styles.narrative}>{supplemental.hospitalityNotes}</Text>
          </View>
        )}

        {supplemental.awardsDescription && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Awards</Text>
            <Text style={styles.narrative}>{supplemental.awardsDescription}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}
```

- [ ] **Step 5: Run AKC tests to confirm pass**

```bash
cd apps/myk9show && npx vitest run src/features/premium/pdf/__tests__/AKCPremiumTemplate.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 6: Write and run UKC template test (same pattern, different org label)**

```tsx
// apps/myk9show/src/features/premium/pdf/__tests__/UKCPremiumTemplate.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UKCPremiumTemplate } from '../UKCPremiumTemplate'
import type { GeneratedPremium } from '../../../../types/premium-types'

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}))

const premium: GeneratedPremium = {
  org: 'UKC',
  show: {
    name: 'UKC Nosework Trial', startDate: '2026-05-08', endDate: '2026-05-10',
    venue: '4411 S. 91st E. Ave., Tulsa, OK', entryOpenDate: '2026-03-16',
    entryCloseDate: '2026-04-29', preEntryFee: 21, dayOfFee: 25,
    acceptChecks: true, acceptCash: false,
  },
  club: { name: 'Companion Dog Club of Tulsa', logoUrl: null },
  secretary: { name: 'Carole Noss', email: 'cdst6901@outlook.com', phone: '918-625-5708', mailingAddress: '9220 W 51st St., Tulsa OK 74107' },
  officials: { chairman: 'Gretchen Hannefield', steward: null },
  trials: [],
  supplemental: {
    vetClinic: { name: 'Animal Emergency Center', address: '4055 S. 102nd Ave.', phone: '918-665-0508' },
    accommodations: [], hospitalityNotes: null, awardsDescription: null, additionalNotes: null,
  },
  narratives: { showHours: 'Building opens at 11:30 AM on Friday.', trialInformation: 'Novice title required for Advanced.' },
}

describe('UKCPremiumTemplate', () => {
  it('renders club name', () => {
    render(<UKCPremiumTemplate premium={premium} />)
    expect(screen.getAllByText(/Companion Dog Club/).length).toBeGreaterThan(0)
  })

  it('renders pre-entry fee', () => {
    render(<UKCPremiumTemplate premium={premium} />)
    expect(screen.getByText(/\$21/)).toBeTruthy()
  })

  it('renders vet clinic', () => {
    render(<UKCPremiumTemplate premium={premium} />)
    expect(screen.getByText(/Animal Emergency Center/)).toBeTruthy()
  })

  it('shows REQUIRED placeholder when vet clinic is null', () => {
    const p = { ...premium, supplemental: { ...premium.supplemental, vetClinic: null } }
    render(<UKCPremiumTemplate premium={p} />)
    expect(screen.getByText(/REQUIRED/)).toBeTruthy()
  })
})
```

- [ ] **Step 7: Implement UKCPremiumTemplate**

UKC premiums follow the same structure as AKC but with UKC-specific boilerplate text (waiver language, registration number requirement). Create `UKCPremiumTemplate.tsx` mirroring `AKCPremiumTemplate.tsx` with these UKC-specific additions:

```tsx
// apps/myk9show/src/features/premium/pdf/UKCPremiumTemplate.tsx
// Same structure as AKCPremiumTemplate. Add this section before the closing Page tag:

// After the awards section, add UKC-specific boilerplate:
<View style={styles.section}>
  <Text style={styles.sectionTitle}>Registration Requirement</Text>
  <Text style={styles.narrative}>
    A UKC REGISTRATION NUMBER IS REQUIRED TO PARTICIPATE IN LICENSED TRIALS.
    For information on UKC registration and rules: www.ukcdogs.com.
  </Text>
</View>

<View style={styles.section}>
  <Text style={styles.sectionTitle}>Waiver</Text>
  <Text style={styles.narrative}>
    All events are held under the Official Rules and Regulations of the United Kennel Club.
    UKC, its agents and employees, and the host club assume no responsibility for any loss,
    damage, or injury sustained by exhibitors or their dogs or property.
  </Text>
</View>
```

The full `UKCPremiumTemplate.tsx` file is identical to `AKCPremiumTemplate.tsx` except for the component name and the two UKC boilerplate sections above.

- [ ] **Step 8: Run UKC tests**

```bash
cd apps/myk9show && npx vitest run src/features/premium/pdf/__tests__/UKCPremiumTemplate.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/features/premium/pdf/
git commit -m "feat(premium-bridge): AKCPremiumTemplate + UKCPremiumTemplate PDF components"
```

---

## Task 7: useGeneratePremium Hook + GeneratePremiumPanel

**Files:**
- Create: `apps/myk9show/src/features/premium/useGeneratePremium.ts`
- Create: `apps/myk9show/src/features/premium/logPremiumGeneration.ts`
- Create: `apps/myk9show/src/features/premium/GeneratePremiumPanel.tsx`

- [ ] **Step 1: Write useGeneratePremium hook**

```typescript
// apps/myk9show/src/features/premium/useGeneratePremium.ts
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GeneratedPremium } from '../../types/premium-types'

interface UseGeneratePremiumResult {
  generate: (showId: string) => Promise<GeneratedPremium>
  isLoading: boolean
  error: string | null
}

export function useGeneratePremium(): UseGeneratePremiumResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate(showId: string): Promise<GeneratedPremium> {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-premium', {
        body: { show_id: showId },
      })
      if (fnError) throw new Error(fnError.message)
      return data as GeneratedPremium
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate premium'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return { generate, isLoading, error }
}
```

- [ ] **Step 2: Write logPremiumGeneration**

```typescript
// apps/myk9show/src/features/premium/logPremiumGeneration.ts
import { insertPremiumGeneration } from '../../services/database/queries/premiumTemplateQueries'
import type { GeneratedPremium, PremiumNarrativeEdit, PremiumFieldOverride } from '../../types/premium-types'

export async function logPremiumGeneration(
  showId: string,
  clubId: string,
  premium: GeneratedPremium,
  fieldOverrides: Record<string, PremiumFieldOverride>,
  narrativeEdits: Record<string, PremiumNarrativeEdit>,
): Promise<void> {
  await insertPremiumGeneration({
    showId,
    clubId,
    templateId: premium.templateId,
    org: premium.org,
    fieldOverrides,
    narrativeEdits,
  })
}
```

- [ ] **Step 3: Write GeneratePremiumPanel**

```tsx
// apps/myk9show/src/features/premium/GeneratePremiumPanel.tsx
import { useState } from 'react'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { Download, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AKCPremiumTemplate } from './pdf/AKCPremiumTemplate'
import { UKCPremiumTemplate } from './pdf/UKCPremiumTemplate'
import { useGeneratePremium } from './useGeneratePremium'
import { logPremiumGeneration } from './logPremiumGeneration'
import type { GeneratedPremium, PremiumFieldOverride, PremiumNarrativeEdit } from '../../types/premium-types'

interface Props {
  open: boolean
  onClose: () => void
  showId: string
  clubId: string
  showOrg: 'AKC' | 'UKC' | null
}

export function GeneratePremiumPanel({ open, onClose, showId, clubId, showOrg }: Props) {
  const { generate, isLoading, error } = useGeneratePremium()
  const [premium, setPremium] = useState<GeneratedPremium | null>(null)
  const [overrides, setOverrides] = useState<GeneratedPremium['supplemental'] | null>(null)
  const [narrativeEdits, setNarrativeEdits] = useState<{ showHours: string; trialInformation: string } | null>(null)
  const [hasNarrativeError, setHasNarrativeError] = useState(false)

  async function handleGenerate() {
    const result = await generate(showId)
    setPremium(result)
    setOverrides(result.supplemental)
    setNarrativeEdits(result.narratives)
    setHasNarrativeError(result.narratives.showHours.startsWith('[REQUIRED'))
  }

  function buildFinalPremium(): GeneratedPremium {
    if (!premium || !overrides || !narrativeEdits) return premium!
    return {
      ...premium,
      supplemental: overrides,
      narratives: narrativeEdits,
    }
  }

  async function handleDownloaded() {
    if (!premium || !overrides || !narrativeEdits) return
    const fieldOverrides: Record<string, PremiumFieldOverride> = {}
    const narrEdits: Record<string, PremiumNarrativeEdit> = {}
    if (JSON.stringify(overrides.vetClinic) !== JSON.stringify(premium.supplemental.vetClinic)) {
      fieldOverrides['vet_clinic'] = { templateValue: premium.supplemental.vetClinic, finalValue: overrides.vetClinic }
    }
    if (overrides.hospitalityNotes !== premium.supplemental.hospitalityNotes) {
      fieldOverrides['hospitality_notes'] = { templateValue: premium.supplemental.hospitalityNotes, finalValue: overrides.hospitalityNotes }
    }
    if (narrativeEdits.showHours !== premium.narratives.showHours) {
      narrEdits['showHours'] = { generatedValue: premium.narratives.showHours, finalValue: narrativeEdits.showHours }
    }
    if (narrativeEdits.trialInformation !== premium.narratives.trialInformation) {
      narrEdits['trialInformation'] = { generatedValue: premium.narratives.trialInformation, finalValue: narrativeEdits.trialInformation }
    }
    // [EXPANDED] non-blocking — PDF already downloaded; losing the log is better than blocking the download
    try {
      await logPremiumGeneration(showId, clubId, premium, fieldOverrides, narrEdits)
    } catch {
      console.error('[premium-bridge] Failed to log premium generation')
    }
  }

  const finalPremium = premium ? buildFinalPremium() : null
  const PdfTemplate = finalPremium?.org === 'UKC' ? UKCPremiumTemplate : AKCPremiumTemplate

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Generate Premium</SheetTitle>
        </SheetHeader>

        {!premium && !isLoading && (
          <div className="mt-6 space-y-4">
            {!showOrg && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>This show has no org set. Set the organization before generating a premium.</AlertDescription>
              </Alert>
            )}
            <Button onClick={handleGenerate} disabled={!showOrg} className="w-full">
              Generate from Show Data
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="mt-10 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Reading show data and generating narratives… (~5–10 seconds)</p>
          </div>
        )}

        {error && (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {premium && overrides && narrativeEdits && (
          <div className="mt-6 space-y-6">
            {hasNarrativeError && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Couldn&apos;t generate narrative sections — your show data is pre-filled. Edit the sections below before downloading.
                </AlertDescription>
              </Alert>
            )}

            {!premium.supplemental.vetClinic && (
              <Alert>
                <AlertDescription>
                  No premium template found for this club. Fill in supplemental fields below, or add a template in Club Settings.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Supplemental Fields</h4>
              <div className="space-y-1">
                <Label className="text-xs">Vet Clinic Name</Label>
                <Input
                  value={overrides.vetClinic?.name ?? ''}
                  onChange={e => setOverrides(o => ({
                    ...o!,
                    vetClinic: { ...(o!.vetClinic ?? { address: '', phone: '' }), name: e.target.value },
                  }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Vet Clinic Address</Label>
                  <Input
                    value={overrides.vetClinic?.address ?? ''}
                    onChange={e => setOverrides(o => ({
                      ...o!,
                      vetClinic: { ...(o!.vetClinic ?? { name: '', phone: '' }), address: e.target.value },
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vet Clinic Phone</Label>
                  <Input
                    value={overrides.vetClinic?.phone ?? ''}
                    onChange={e => setOverrides(o => ({
                      ...o!,
                      vetClinic: { ...(o!.vetClinic ?? { name: '', address: '' }), phone: e.target.value },
                    }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hospitality Notes</Label>
                <Textarea
                  rows={2}
                  value={overrides.hospitalityNotes ?? ''}
                  onChange={e => setOverrides(o => ({ ...o!, hospitalityNotes: e.target.value || null }))}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Generated Narratives (editable)</h4>
              <div className="space-y-1">
                <Label className="text-xs">Show Hours</Label>
                <Textarea
                  rows={3}
                  value={narrativeEdits.showHours}
                  onChange={e => setNarrativeEdits(n => ({ ...n!, showHours: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Trial Information</Label>
                <Textarea
                  rows={4}
                  value={narrativeEdits.trialInformation}
                  onChange={e => setNarrativeEdits(n => ({ ...n!, trialInformation: e.target.value }))}
                />
              </div>
            </div>

            {/* [EXPANDED] handle PDFDownloadLink error state */}
            <PDFDownloadLink
              document={<PdfTemplate premium={finalPremium} />}
              fileName={`${premium.show.name.replace(/\s+/g, '-')}-premium.pdf`}
              onClick={handleDownloaded}
            >
              {({ loading, error: pdfError }) => {
                if (pdfError) return (
                  <Button className="w-full" variant="destructive" disabled>
                    PDF generation failed — check console
                  </Button>
                )
                return (
                  <Button className="w-full" disabled={loading}>
                    <Download className="h-4 w-4 mr-2" />
                    {loading ? 'Preparing PDF…' : 'Download Premium PDF'}
                  </Button>
                )
              }}
            </PDFDownloadLink>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | grep -i premium
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/premium/useGeneratePremium.ts \
        apps/myk9show/src/features/premium/logPremiumGeneration.ts \
        apps/myk9show/src/features/premium/GeneratePremiumPanel.tsx
git commit -m "feat(premium-bridge): useGeneratePremium + GeneratePremiumPanel"
```

---

## Task 8: Wire Generate Premium Button into ShowDetailsPage

**Files:**
- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`

- [ ] **Step 1: Add import + state + button to ShowDetailsPage**

Open `apps/myk9show/src/pages/ShowDetailsPage.tsx`. Make these three changes:

**Add import** near the top with other panel imports:
```tsx
import { GeneratePremiumPanel } from '../features/premium/GeneratePremiumPanel'
import { FileText } from 'lucide-react'
```

**Add state** near other panel visibility state (around line 17 area):
```tsx
const [premiumPanelOpen, setPremiumPanelOpen] = useState(false)
```

**Add button** in the header action buttons area (around line 364 alongside the Edit button):
```tsx
{(show.organization === 'AKC' || show.organization === 'UKC') && (
  <Button variant="outline" size="sm" onClick={() => setPremiumPanelOpen(true)}>
    <FileText className="h-4 w-4 mr-2" />
    Generate Premium
  </Button>
)}
```

**Add panel** just before the closing return fragment (alongside other panels/dialogs):
```tsx
<GeneratePremiumPanel
  open={premiumPanelOpen}
  onClose={() => setPremiumPanelOpen(false)}
  showId={show.id}
  clubId={show.club_id}
  showOrg={show.organization as 'AKC' | 'UKC' | null}
/>
```

- [ ] **Step 2: [ADDED] Also wire the button into the Pipeline dashboard**

Open `apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx`. Add the same button and panel alongside the existing pipeline action buttons (around lines 205–220):

```tsx
// Add import at top:
import { GeneratePremiumPanel } from '../../../features/premium/GeneratePremiumPanel'
import { FileText } from 'lucide-react'

// Add state near other useState calls:
const [premiumPanelOpen, setPremiumPanelOpen] = useState(false)

// Add button in the pipeline actions area:
{(show.organization === 'AKC' || show.organization === 'UKC') && (
  <Button variant="outline" size="sm" onClick={() => setPremiumPanelOpen(true)}>
    <FileText className="h-4 w-4 mr-2" />
    Generate Premium
  </Button>
)}

// Add panel before closing fragment:
<GeneratePremiumPanel
  open={premiumPanelOpen}
  onClose={() => setPremiumPanelOpen(false)}
  showId={show.id}
  clubId={show.club_id}
  showOrg={show.organization as 'AKC' | 'UKC' | null}
/>
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Start dev server and manually verify**

```bash
pnpm dev:show
```

1. Log in as `secretary@myk9t.com` / `testpass123`
2. Open a show with org set to AKC or UKC
3. Confirm "Generate Premium" button appears in the page header
4. Click it — panel opens
5. Click "Generate from Show Data" — loading spinner appears, then fields populate
6. Edit a supplemental field and a narrative field
7. Click "Download Premium PDF" — PDF downloads to your browser
8. Verify the downloaded PDF contains the show name, club name, fees, judge names, and edited content

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/ShowDetailsPage.tsx \
        apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx
git commit -m "feat(premium-bridge): Generate Premium button on ShowDetailsPage + Pipeline dashboard"
```

---

## Task 9: QA Walk

- [ ] **Step 1: Set up club premium template**

1. Log in as `secretary@myk9t.com`
2. Navigate to the club associated with your test show
3. Open Club Edit panel → Premium Templates tab
4. Create a template named "Scent Work" with trial type "Scent Work"
   - Vet Clinic Name: `Animal Emergency Center`
   - Vet Clinic Address: `4055 S. 102nd Ave., Tulsa, OK`
   - Vet Clinic Phone: `918-665-0508`
   - Hospitality Notes: `Lunch on Saturday and Sunday.`
   - Awards: `Ribbons 1st–4th. Rosettes for new titles.`
5. Check "Use as default template" → Save
6. Confirm template appears in the list

- [ ] **Step 2: Generate AKC premium**

1. Open an AKC Scent Work show
2. Click "Generate Premium"
3. Verify vet clinic fields are pre-filled from the template (not blank)
4. Verify show name, dates, and fees appear correctly
5. Verify narratives are populated (not `[REQUIRED…]`)
6. Change the vet clinic phone number — this will be logged as an override
7. Download the PDF
8. Open the PDF — verify all sections are present and correct

- [ ] **Step 3: Generate UKC premium**

1. Open a UKC show (or change the test show org to UKC)
2. Click "Generate Premium"
3. Download the PDF
4. Verify the UKC-specific boilerplate appears ("A UKC REGISTRATION NUMBER IS REQUIRED…")

- [ ] **Step 4: Verify consecutive override nudge**

1. Generate + download 3 premiums from the same club, each time changing the vet clinic phone
2. Navigate to Club settings → Premium Templates tab
3. Confirm the amber nudge appears: "You've changed Vet Clinic for your last 3 shows — consider updating your template."

- [ ] **Step 4: [ADDED] Verify auth + access control**

1. Log in as `exhibitor1@myk9t.com` — navigate to a show detail page and confirm **"Generate Premium" button does not appear**
2. Log in as `secretary@myk9t.com` — confirm button appears on both ShowDetailsPage and Pipeline dashboard for shows assigned to their club
3. Confirm button is hidden for shows with `organization` set to anything other than `AKC` or `UKC`

- [ ] **Step 5: [ADDED] Verify error states**

1. Open a show where the club has no premium template → confirm amber "No template found" alert appears before clicking generate
2. After generating, clear the vet clinic name field and download → open PDF and confirm `[REQUIRED — add before submitting]` appears in the Veterinary Information section
3. Confirm the "Generate Premium" button on Pipeline dashboard opens the same panel and produces the same PDF as the ShowDetailsPage button

- [ ] **Step 7: Final typecheck + test run**

```bash
cd apps/myk9show && pnpm typecheck && npx vitest run src/features/premium/
```

Expected: typecheck clean, all premium tests pass.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(premium-bridge): Phase 1 complete — show→premium export with club templates"
```
