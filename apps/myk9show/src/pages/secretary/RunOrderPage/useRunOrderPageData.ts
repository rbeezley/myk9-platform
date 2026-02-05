import { useState, useEffect } from 'react';
import { useClassCreationStore } from '@/store/classCreationStore';
import { CreatedClass } from '@/types/template.types';
import { ScheduleConfig, TimeCalculationEngine } from '@/lib/timeCalculation';
import { logger } from '@/services/LoggingService';
import type { Personnel, PersonnelAssignment } from '@/components/templates/secretary/PersonnelManager';
import { MOCK_PERSONNEL } from './mockPersonnel';

const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  trialStartTime: new Date(),
  defaultBreakDuration: 15,
  lunchBreak: {
    startTime: '12:00',
    duration: 60
  },
  judgeBreakRequirement: 10
};

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
  availableJudges: Personnel[];

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
  const {
    getClassesByTrial,
    updateClassRunOrder,
    updateClassJudge
  } = useClassCreationStore();

  const [activeTab, setActiveTab] = useState('runorder');
  const [classes, setClasses] = useState<CreatedClass[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [assignments, setAssignments] = useState<PersonnelAssignment[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(DEFAULT_SCHEDULE_CONFIG);

  // Load classes for this trial
  useEffect(() => {
    if (trialId) {
      queueMicrotask(() => {
        const trialClasses = getClassesByTrial(trialId);
        setClasses(trialClasses);

        // Set trial start time to 9 AM today
        const startTime = new Date();
        startTime.setHours(9, 0, 0, 0);
        setScheduleConfig(prev => ({ ...prev, trialStartTime: startTime }));
      });
    }
  }, [trialId, getClassesByTrial]);

  // Load mock personnel data
  useEffect(() => {
    queueMicrotask(() => {
      setPersonnel(MOCK_PERSONNEL);
    });
  }, []);

  // Generate initial assignments based on current class data
  useEffect(() => {
    queueMicrotask(() => {
      const initialAssignments: PersonnelAssignment[] = [];

      classes.forEach(cls => {
        if (cls.personnel.judgeId) {
          initialAssignments.push({
            classId: cls.id,
            className: cls.className,
            role: 'judgeId',
            personnelId: cls.personnel.judgeId,
            startTime: cls.plannedStartTime || new Date(),
            endTime: new Date((cls.plannedStartTime || new Date()).getTime() + (Number(cls.fieldValues.estimatedJudgingTime || 30) * 60000)),
            conflicts: []
          });
        }

        // Add steward assignments if they exist
        Object.entries(cls.personnel.stewards).forEach(([role, stewId]) => {
          if (stewId) {
            initialAssignments.push({
              classId: cls.id,
              className: cls.className,
              role,
              personnelId: Array.isArray(stewId) ? stewId[0] : stewId,
              startTime: cls.plannedStartTime || new Date(),
              endTime: new Date((cls.plannedStartTime || new Date()).getTime() + (Number(cls.fieldValues.estimatedJudgingTime || 30) * 60000)),
              conflicts: []
            });
          }
        });
      });

      setAssignments(initialAssignments);
    });
  }, [classes]);

  // Calculate schedule statistics
  const timeEngine = new TimeCalculationEngine(scheduleConfig);
  const schedule = timeEngine.calculateSchedule(classes);
  const stats = timeEngine.getScheduleStats(schedule);

  // Computed values
  const availableJudges = personnel.filter(p => p.roles.some(r => r.type === 'judge'));

  // Handlers
  const handleReorder = (reorderedClasses: CreatedClass[]) => {
    setClasses(reorderedClasses);
    reorderedClasses.forEach(cls => {
      updateClassRunOrder(cls.id, cls.runOrder);
    });
  };

  const handleJudgeAssign = (classId: string, judgeId: string) => {
    updateClassJudge(classId, judgeId);
    setClasses(prev => prev.map(cls =>
      cls.id === classId
        ? { ...cls, judgeId }
        : cls
    ));
  };

  const handleAssignmentChange = (classId: string, role: string, personnelId: string | null) => {
    // Update assignments
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
            startTime: cls.plannedStartTime || new Date(),
            endTime: new Date((cls.plannedStartTime || new Date()).getTime() + (Number(cls.fieldValues.estimatedJudgingTime || 30) * 60000)),
            conflicts: []
          });
        }
      }

      return filtered;
    });

    // Update class data for judges and stewards
    if (role === 'judgeId') {
      handleJudgeAssign(classId, personnelId || '');
    } else {
      // Update steward assignments in class data
      setClasses(prev => prev.map(cls => {
        if (cls.id === classId) {
          const updatedStewards = { ...cls.personnel.stewards };
          if (personnelId) {
            if (role === 'ring') {
              updatedStewards[role] = [personnelId];
            } else {
              (updatedStewards as Record<string, string>)[role] = personnelId;
            }
          } else {
            delete updatedStewards[role as keyof typeof updatedStewards];
          }
          return { ...cls, personnel: { ...cls.personnel, stewards: updatedStewards } };
        }
        return cls;
      }));
    }
  };

  const handlePersonnelAdd = (person: Personnel) => {
    setPersonnel(prev => [...prev, person]);
  };

  const handlePersonnelUpdate = (id: string, updates: Partial<Personnel>) => {
    setPersonnel(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
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
    // Implementation would depend on export requirements
  };

  const handleOptimize = () => {
    const optimized = timeEngine.optimizeSchedule(classes);
    setClasses(optimized);
  };

  return {
    // State
    activeTab,
    setActiveTab,
    classes,
    personnel,
    assignments,
    scheduleConfig,

    // Computed
    schedule,
    stats,
    availableJudges,

    // Handlers
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
