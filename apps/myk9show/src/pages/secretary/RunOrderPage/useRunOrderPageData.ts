import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrialClassesWithQuery } from '@/hooks/useClassStoreCompat';
import { CreatedClass } from '@/types/template.types';
import { ScheduleConfig, TimeCalculationEngine } from '@/lib/timeCalculation';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { queryKeys } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import { getJudgesWithQualifications, upsertClassJudgeAssignment } from '@/services/database/judges';
import { DISPLAY_ORDER_STEP } from '@/features/pipeline/utils/pipelineReorder';
import type {
  Personnel,
  PersonnelAssignment,
} from '@/components/templates/secretary/PersonnelManager';
import { MOCK_PERSONNEL } from './mockPersonnel';
import { mapClassesToCreatedClasses } from './mapClassToCreatedClass';

type StewardRole = 'gate' | 'table' | 'timer' | 'ring';

function nineAmToday(): Date {
  const t = new Date();
  t.setHours(9, 0, 0, 0);
  return t;
}

function defaultScheduleConfig(): ScheduleConfig {
  return {
    trialStartTime: nineAmToday(),
    defaultBreakDuration: 15,
    lunchBreak: { startTime: '12:00', duration: 60 },
    judgeBreakRequirement: 10,
  };
}

function classWindow(cls: CreatedClass): { startTime: Date; endTime: Date } {
  const start = cls.plannedStartTime ?? new Date();
  const minutes = Number(cls.fieldValues.estimatedJudgingTime || 30);
  return {
    startTime: start,
    endTime: new Date(start.getTime() + minutes * 60000),
  };
}

type Stewards = CreatedClass['personnel']['stewards'];

function applyStewardChange(
  stewards: Stewards,
  role: StewardRole,
  personnelId: string | null
): Stewards {
  const next: Stewards = { ...stewards };
  if (personnelId === null) {
    delete next[role];
    return next;
  }
  if (role === 'ring') {
    next.ring = [personnelId];
  } else {
    next[role] = personnelId;
  }
  return next;
}

export interface UseRunOrderPageDataReturn {
  // State
  activeTab: string;
  setActiveTab: (tab: string) => void;
  classes: CreatedClass[];
  personnel: Personnel[];
  assignments: PersonnelAssignment[];
  scheduleConfig: ScheduleConfig;

  // Computed
  schedule: ReturnType<TimeCalculationEngine['calculateSchedule']>;
  stats: ReturnType<TimeCalculationEngine['getScheduleStats']>;
  availableJudges: { id: string; name: string }[];
  isLoading: boolean;

  // Handlers
  handleReorder: (reorderedClasses: CreatedClass[]) => void;
  handleJudgeAssign: (classId: string, judgeId: string) => void;
  handleAssignmentChange: (classId: string, role: string, personnelId: string | null) => void;
  handlePersonnelAdd: (person: Personnel) => void;
  handlePersonnelUpdate: (id: string, updates: Partial<Personnel>) => void;
  handlePersonnelDelete: (id: string) => void;
  handleConfigChange: (updates: Partial<ScheduleConfig>) => void;
  handleExport: (format: 'pdf' | 'csv' | 'json') => void;
  handleOptimize: () => void;
}

export function useRunOrderPageData(trialId: string | undefined): UseRunOrderPageDataReturn {
  const queryClient = useQueryClient();
  const trialClassesQuery = useTrialClassesWithQuery(trialId ?? '', !!trialId);

  // Fetch the trial row so we have showId for judge_assignments writes.
  const trialQuery = useQuery({
    queryKey: queryKeys.trial(trialId!),
    queryFn: () => replicatedTrialsTable.getTrialById(trialId!),
    enabled: !!trialId,
    staleTime: 5 * 60 * 1000,
  });
  const showId = trialQuery.data?.showId;

  // Fetch real judges from DB — replaces the MOCK_PERSONNEL judge filter.
  const judgesQuery = useQuery({
    queryKey: queryKeys.judgesWithQualifications,
    queryFn: getJudgesWithQualifications,
    staleTime: 10 * 60 * 1000,
  });

  const [activeTab, setActiveTab] = useState('runorder');
  const [classes, setClasses] = useState<CreatedClass[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>(() => MOCK_PERSONNEL);
  const [assignments, setAssignments] = useState<PersonnelAssignment[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(defaultScheduleConfig);

  // Hydrate local class list from Supabase whenever the trial changes or the
  // query resolves. Local state still backs drag-to-reorder and judge picks
  // (those are session-scoped until we persist them — see follow-up todo).
  // queueMicrotask defers the setState past the current render — required
  // by the project's react-hooks/set-state-in-effect lint guard.
  useEffect(() => {
    const mapped = mapClassesToCreatedClasses(trialClassesQuery.classes);
    queueMicrotask(() => setClasses(mapped));
  }, [trialClassesQuery.classes]);

  useEffect(() => {
    queueMicrotask(() => {
      const initialAssignments: PersonnelAssignment[] = [];

      classes.forEach(cls => {
        const window = classWindow(cls);
        if (cls.personnel.judgeId) {
          initialAssignments.push({
            classId: cls.id,
            className: cls.className,
            role: 'judgeId',
            personnelId: cls.personnel.judgeId,
            ...window,
            conflicts: [],
          });
        }

        Object.entries(cls.personnel.stewards).forEach(([role, stewId]) => {
          if (!stewId) return;
          initialAssignments.push({
            classId: cls.id,
            className: cls.className,
            role,
            personnelId: Array.isArray(stewId) ? stewId[0] : stewId,
            ...window,
            conflicts: [],
          });
        });
      });

      setAssignments(initialAssignments);
    });
  }, [classes]);

  const timeEngine = useMemo(() => new TimeCalculationEngine(scheduleConfig), [scheduleConfig]);
  const schedule = useMemo(() => timeEngine.calculateSchedule(classes), [timeEngine, classes]);
  const stats = useMemo(() => timeEngine.getScheduleStats(schedule), [timeEngine, schedule]);

  const availableJudges = useMemo(
    () =>
      (judgesQuery.data?.data ?? []).map(p => ({
        id: p.id,
        name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      })),
    [judgesQuery.data]
  );

  const handleReorder = (reorderedClasses: CreatedClass[]) => {
    setClasses(reorderedClasses);
    // Skip writes when nothing moved (user clicked Save without dragging).
    const unchanged = reorderedClasses.every((cls, i) => cls.id === classes[i]?.id);
    if (unchanged) return;
    const updates = reorderedClasses.map(cls =>
      replicatedClassesTable.updateClass(cls.id, {
        displayOrder: cls.runOrder * DISPLAY_ORDER_STEP,
      })
    );
    Promise.allSettled(updates).then(results => {
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failures.length > 0) {
        notifications.error('Failed to save run order — changes will be lost on reload');
      }
    });
  };

  const handleJudgeAssign = (classId: string, judgeId: string) => {
    setClasses(prev =>
      prev.map(cls =>
        cls.id === classId ? { ...cls, personnel: { ...cls.personnel, judgeId } } : cls
      )
    );
    if (!showId) {
      logger.warn(
        'handleJudgeAssign: showId not yet loaded — judge pick will not persist',
        'run-order',
        { classId, judgeId }
      );
      return;
    }
    if (judgeId) {
      upsertClassJudgeAssignment(showId, classId, judgeId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: classKeys.lists() });
          if (trialId) {
            queryClient.invalidateQueries({ queryKey: classKeys.byTrial(trialId) });
          }
        })
        .catch(() => {
          notifications.error('Failed to save judge assignment');
        });
    }
  };

  const handleAssignmentChange = (classId: string, role: string, personnelId: string | null) => {
    setAssignments(prev => {
      const filtered = prev.filter(a => !(a.classId === classId && a.role === role));

      if (personnelId) {
        const cls = classes.find(c => c.id === classId);
        if (cls) {
          filtered.push({
            classId,
            className: cls.className,
            role,
            personnelId,
            ...classWindow(cls),
            conflicts: [],
          });
        }
      }

      return filtered;
    });

    if (role === 'judgeId') {
      handleJudgeAssign(classId, personnelId || '');
      return;
    }

    setClasses(prev =>
      prev.map(cls =>
        cls.id === classId
          ? {
              ...cls,
              personnel: {
                ...cls.personnel,
                stewards: applyStewardChange(
                  cls.personnel.stewards,
                  role as StewardRole,
                  personnelId
                ),
              },
            }
          : cls
      )
    );
  };

  const handlePersonnelAdd = (person: Personnel) => {
    setPersonnel(prev => [...prev, person]);
  };

  const handlePersonnelUpdate = (id: string, updates: Partial<Personnel>) => {
    setPersonnel(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const handlePersonnelDelete = (id: string) => {
    setPersonnel(prev => prev.filter(p => p.id !== id));
    setAssignments(prev => prev.filter(a => a.personnelId !== id));
  };

  const handleConfigChange = (updates: Partial<ScheduleConfig>) => {
    setScheduleConfig(prev => ({ ...prev, ...updates }));
  };

  const handleExport = (format: 'pdf' | 'csv' | 'json') => {
    logger.debug(`Exporting schedule in ${format} format`, 'pages', {});
  };

  const handleOptimize = () => {
    // Reassign sequential runOrder after sorting, then route through handleReorder
    // so the new order is persisted to display_order just like a manual drag.
    const reordered = timeEngine
      .optimizeSchedule(classes)
      .map((cls, i) => ({ ...cls, runOrder: i + 1 }));
    handleReorder(reordered);
  };

  return {
    activeTab,
    setActiveTab,
    classes,
    personnel,
    assignments,
    scheduleConfig,

    schedule,
    stats,
    availableJudges,
    isLoading: trialClassesQuery.isLoading || trialQuery.isLoading || judgesQuery.isLoading,

    handleReorder,
    handleJudgeAssign,
    handleAssignmentChange,
    handlePersonnelAdd,
    handlePersonnelUpdate,
    handlePersonnelDelete,
    handleConfigChange,
    handleExport,
    handleOptimize,
  };
}
