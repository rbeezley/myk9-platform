/**
 * CloneFromShowCombobox — lightweight combobox at the top of step 1.
 *
 * Lists the secretary's past shows (filtered to their clubs). Selecting one
 * prefills all wizard form fields via updateShowData / addJudgeToShow so the
 * secretary can edit from a known baseline instead of starting from scratch.
 * Selecting "Start fresh" resets show data back to the wizard's empty defaults.
 */

import React, { useState, useMemo, useRef } from 'react';
import { Copy, ChevronsUpDown, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useWizardStore } from '@/store/wizardStore';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { useUserStore } from '@/store/userStore';
import { useUserClubIds } from '@/hooks/useUserClubIds';
import { useTemplates } from '@/hooks/useTemplates';
import { getClassesByTrialId } from '@/services/database/classes';
import type { Class, Show } from '@/types/show-types';
import type { ClassTemplate } from '@/types/template.types';

interface CloneFromShowComboboxProps {
  /** Optional: restrict to this clubId (pre-selected club context) */
  clubId?: string | undefined;
}

export const CloneFromShowCombobox: React.FC<CloneFromShowComboboxProps> = ({ clubId }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [clonedShowName, setClonedShowName] = useState<string | null>(null);
  const cloneRequestIdRef = useRef(0);

  const { updateShowData, addJudgeToShow, addTrial, resetWizard } = useWizardStore();
  const { people } = useUserStore();
  const { data: allShows = [], isLoading, isError } = useShowsQuery();
  const { templates } = useTemplates();

  // Determine which club IDs this user has secretary/admin access to
  const userClubIds = useUserClubIds();

  // Filter shows to the user's clubs (and optionally a specific clubId context)
  const candidateShows = useMemo(() => {
    return allShows
      .filter(s => {
        if (clubId && s.clubId !== clubId) return false;
        if (userClubIds && !userClubIds.has(s.clubId)) return false;
        return true;
      })
      .sort((a, b) => {
        // Most recent first
        const da = a.startDate ? new Date(a.startDate).getTime() : 0;
        const db = b.startDate ? new Date(b.startDate).getTime() : 0;
        return db - da;
      });
  }, [allShows, clubId, userClubIds]);

  // Apply search filter
  const filteredShows = useMemo(() => {
    if (!search.trim()) return candidateShows;
    const term = search.toLowerCase();
    return candidateShows.filter(
      s =>
        s.name.toLowerCase().includes(term) ||
        s.location?.toLowerCase().includes(term) ||
        s.organization?.toLowerCase().includes(term)
    );
  }, [candidateShows, search]);

  const handleSelect = async (show: Show) => {
    const requestId = cloneRequestIdRef.current + 1;
    cloneRequestIdRef.current = requestId;
    setOpen(false);
    setSearch('');
    setClonedShowName(show.name);
    resetWizard();

    // Prefill all non-date show fields
    updateShowData({
      name: show.name,
      organization: show.organization as 'AKC' | 'UKC' | 'Other',
      location: show.location || '',
      clubId: show.clubId || '',
      preEntryFee: parseFloat(show.preEntryFee) || 0,
      dayOfShowFee: parseFloat(show.dayOfShowFee || '0') || 0,
      startingArmbandNumber: show.startingArmbandNumber ?? 100,
      acceptCheckPayments: show.acceptCheckPayments ?? false,
      acceptCashPayments: show.acceptCashPayments ?? false,
      // Dates are intentionally left blank so the secretary fills them in
      startDate: '',
      endDate: '',
      entryOpenDate: '',
      entryCloseDate: '',
    });

    // Re-add judges from the source show
    if (show.assignedJudges?.length) {
      for (const assignment of show.assignedJudges) {
        const person = people.find(p => p.id === assignment.judgeId);
        addJudgeToShow(assignment.judgeId, {
          name: person
            ? `${person.firstName} ${person.lastName}`
            : assignment.judgeName || 'Unknown Judge',
          email: person?.email || '',
          phone: person?.phone || '',
          certifications: person?.judgeQualifications?.map(q => q.organization) || [],
          notes: '',
        });
      }
    }

    const sourceTrials = await getCloneSourceTrials(show);
    if (requestId !== cloneRequestIdRef.current) return;

    if (sourceTrials.length) {
      for (const trial of sourceTrials) {
        const sourceClasses = trial.classes || [];
        // Wizard state stores one template id per class. Normal trial data is single-sport, and
        // customizations preserve the visible class details if the template cannot be recovered.
        const template = resolveCloneTemplate({
          templates,
          organization: show.organization,
          trialType: trial.trialType,
          classes: sourceClasses,
        });

        addTrial({
          name: trial.name || 'Trial',
          dateTime: '',
          eventNumber: '',
          trialType: trial.trialType,
          classes: sourceClasses.map(cls => {
            const judgeId =
              (show.assignedJudges || []).find(judge => judge.assignedClasses?.includes(cls.id))
                ?.judgeId || undefined;

            return {
              templateId: cls.templateId || template?.id || '',
              customizations: {
                className: cls.name,
                element: cls.element,
                level: cls.level,
                section: cls.section,
                entryFee: cls.entryFee,
                hidesUsed: cls.hidesUsed,
                distractionsUsed: cls.distractionsUsed,
                itemsUsed: cls.itemsUsed,
                timeLimit1: cls.timeLimit1,
                timeLimit2: cls.timeLimit2,
                timeLimit3: cls.timeLimit3,
              },
              ...(judgeId ? { judgeId } : {}),
            };
          }),
        });
      }
    }
  };

  const handleStartFresh = () => {
    cloneRequestIdRef.current += 1;
    setClonedShowName(null);
    resetWizard();
  };

  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">We could not load previous shows.</p>
        <p>You can still enter this show manually.</p>
      </div>
    );
  }

  if (candidateShows.length === 0 && !isLoading) {
    // No past shows to clone from — render nothing so the form looks clean for new users
    return null;
  }

  return (
    <div className="relative bg-primary/5 border border-primary/20 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Copy className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground mb-1">Clone from a previous show</p>
          <p className="text-xs text-muted-foreground mb-3">
            Prefill this form from an existing show. Dates are always left blank for you to set
            fresh.
          </p>

          {clonedShowName ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
                <Check className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[240px]">{clonedShowName}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleStartFresh}
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground px-2"
              >
                <X className="h-3.5 w-3.5" />
                Start fresh
              </Button>
            </div>
          ) : (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 bg-background/60 border-border hover:bg-background/80 text-sm"
                  aria-expanded={open}
                >
                  Select a past show to clone
                  <ChevronsUpDown className="h-4 w-4 opacity-50 ml-auto" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="p-3 border-b">
                  <Input
                    placeholder="Search shows..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-8"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {isLoading && (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      Loading shows...
                    </div>
                  )}
                  {!isLoading && filteredShows.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No matching shows found.
                    </div>
                  )}
                  {filteredShows.map(show => (
                    <button
                      key={show.id}
                      type="button"
                      onClick={() => void handleSelect(show)}
                      className="w-full px-3 py-2.5 text-left hover:bg-accent hover:text-accent-foreground transition-colors duration-150 flex flex-col gap-0.5"
                    >
                      <span className="text-sm font-medium leading-tight truncate">
                        {show.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {show.organization}
                        {show.startDate
                          ? ` · ${format(new Date(show.startDate), 'MMM d, yyyy')}`
                          : ''}
                        {show.location ? ` · ${show.location.split('\n')[0].split(',')[0]}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      {/* Subtle note that dates are excluded */}
      {clonedShowName && (
        <p className="text-xs text-muted-foreground mt-3 pl-11">
          Show dates and entry period dates were left blank. Fill them in below.
        </p>
      )}
    </div>
  );
};

async function getCloneSourceTrials(show: Show): Promise<Show['trials']> {
  if (!show.trials?.length) return [];

  return await Promise.all(
    show.trials.map(async trial => {
      if (trial.classes?.length) return trial;

      try {
        // Show-list reads can come from a cold replicated class store. Hydrate the selected
        // trial lazily so clone preserves class structure without widening every list query.
        const { data, error } = await getClassesByTrialId(trial.id);
        if (error || data.length === 0) return trial;

        return {
          ...trial,
          classes: data.map(mapFetchedClassToShowClass),
        };
      } catch {
        return trial;
      }
    })
  );
}

function mapFetchedClassToShowClass(value: Record<string, unknown>): Class {
  const name = optionalString(value.name) || optionalString(value.className) || 'Unnamed Class';
  const entryFee = optionalNumber(value.entry_fee ?? value.entryFee);

  return {
    id: optionalString(value.id) || name,
    templateId: optionalString(value.template_id ?? value.templateId),
    name,
    description: optionalString(value.description),
    entryFee,
    level: optionalString(value.level),
    element: optionalString(value.element),
    section: optionalString(value.section),
    hidesUsed: optionalString(value.hides_used ?? value.hidesUsed),
    distractionsUsed: optionalString(value.distractions_used ?? value.distractionsUsed),
    itemsUsed: optionalString(value.items_used ?? value.itemsUsed),
    timeLimit1: optionalString(value.time_limit1 ?? value.timeLimit1),
    timeLimit2: optionalString(value.time_limit2 ?? value.timeLimit2),
    timeLimit3: optionalString(value.time_limit3 ?? value.timeLimit3),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function resolveCloneTemplate(args: {
  templates: ClassTemplate[];
  organization: string;
  trialType?: string | undefined;
  classes: Class[];
}): ClassTemplate | undefined {
  const normalizedOrganization = normalizeText(args.organization);
  const normalizedTrialType = normalizeText(args.trialType);
  const sourceClasses = args.classes.filter(cls => cls.name || cls.element || cls.level);

  const candidates = args.templates.filter(template => {
    if (!template.isActive) return false;

    const templateOrganization = normalizeText(template.organization);
    const organizationMatches =
      templateOrganization === normalizedOrganization ||
      normalizedOrganization.includes(templateOrganization) ||
      templateOrganization.includes(normalizedOrganization);
    if (!organizationMatches) return false;

    if (!normalizedTrialType) return true;

    const templateTrialType = normalizeText(template.trialType);
    return (
      templateTrialType === normalizedTrialType ||
      templateTrialType.includes(normalizedTrialType) ||
      normalizedTrialType.includes(templateTrialType)
    );
  });

  const best = candidates
    .map(template => ({ template, score: scoreTemplateMatch(template, sourceClasses) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return undefined;
  if (sourceClasses.length > 0 && best.score === 0) return undefined;
  return best.template;
}

function scoreTemplateMatch(template: ClassTemplate, sourceClasses: Class[]): number {
  if (sourceClasses.length === 0) return 0;

  return sourceClasses.reduce((score, cls) => {
    const normalizedClassName = normalizeText(cls.name);
    const normalizedElement = normalizeText(cls.element);
    const normalizedLevel = normalizeText(cls.level);

    const hasMatchingClass = template.classDefinitions.some(def => {
      const classNameMatches =
        normalizedClassName !== '' && normalizeText(def.className) === normalizedClassName;
      const elementMatches =
        normalizedElement !== '' && normalizeText(def.element) === normalizedElement;
      const levelMatches = normalizedLevel === '' || normalizeText(def.level) === normalizedLevel;

      return classNameMatches || (elementMatches && levelMatches);
    });

    return hasMatchingClass ? score + 1 : score;
  }, 0);
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .trim();
}

export default CloneFromShowCombobox;
