import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';

/** Maps show organization to a default trial type (discipline). */
const DEFAULT_TRIAL_TYPE: Partial<Record<string, string>> = {
  AKC: 'Scent Work',
  UKC: 'Nosework',
  NACSW: 'Nosework',
  ASCA: 'Scent Detection',
};

interface WizardState {
  currentStep: number;
  completedSteps: number[];
  isDirty: boolean;
  lastSaved: Date | null;

  // Show data
  show: {
    name: string;
    organization: string;
    startDate: string; // ISO datetime string
    endDate: string; // ISO datetime string
    location: string;
    clubId: string;
    entryOpenDate: string; // ISO datetime string
    entryCloseDate: string; // ISO datetime string
    preEntryFee: number;
    dayOfShowFee: number;
    startingArmbandNumber: number;
    officials: {
      secretary: string[]; // people.id values
      chairman: string[];
      steward: string[];
    };
    judgeIds: string[]; // Judges assigned to the show
    acceptCheckPayments: boolean;
    acceptCashPayments: boolean;
  };

  // Trials data
  trials: Array<{
    id: string; // temp ID for wizard
    name: string;
    dateTime: string; // ISO datetime string
    eventNumber: string;
    trialType?: string | undefined; // e.g. 'Scent Work', 'Agility', 'Obedience'
    classes: Array<{
      templateId: string;
      customizations: Record<string, unknown>;
      judgeId?: string | undefined;
    }>;
  }>;

  // Judge assignments (from show pool)
  judgeAssignments: Record<string, string>; // classId -> judgeId

  // Judge metadata
  judgeDetails: Record<
    string,
    {
      name: string;
      email: string;
      phone: string;
      certifications?: string[] | undefined;
      notes?: string | undefined;
    }
  >;
}

interface WizardActions {
  // Navigation
  setCurrentStep: (step: number) => void;
  markStepCompleted: (step: number) => void;
  goToStep: (step: number) => void;

  // Show data
  updateShowData: (data: Partial<WizardState['show']>) => void;

  // Trial management
  addTrial: (trial: Omit<WizardState['trials'][0], 'id'>) => void;
  updateTrial: (id: string, data: Partial<WizardState['trials'][0]>) => void;
  removeTrial: (id: string) => void;
  reorderTrials: (startIndex: number, endIndex: number) => void;

  // Judge management
  addJudgeToShow: (judgeId: string, details: WizardState['judgeDetails'][string]) => void;
  removeJudgeFromShow: (judgeId: string) => void;
  assignJudgeToClass: (classId: string, judgeId: string) => void;

  // State management
  setDirty: (isDirty: boolean) => void;
  saveProgress: () => void;
  resetWizard: () => void;
  loadDraft: (draft: Partial<WizardState>) => void;
}

const initialState: WizardState = {
  currentStep: 0,
  completedSteps: [],
  isDirty: false,
  lastSaved: null,
  show: {
    name: '',
    organization: 'AKC',
    startDate: '',
    endDate: '',
    location: '',
    clubId: '',
    entryOpenDate: '',
    entryCloseDate: '',
    preEntryFee: 0,
    dayOfShowFee: 0,
    startingArmbandNumber: 100,
    officials: {
      secretary: [],
      chairman: [],
      steward: [],
    },
    judgeIds: [],
    acceptCheckPayments: false,
    acceptCashPayments: false,
  },
  trials: [],
  judgeAssignments: {},
  judgeDetails: {},
};

export const useWizardStore = create<WizardState & WizardActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Navigation
      setCurrentStep: step => set({ currentStep: step }),

      markStepCompleted: step => {
        const { completedSteps } = get();
        if (completedSteps.includes(step)) return;
        set({ completedSteps: [...completedSteps, step].sort((a, b) => a - b) });
      },

      goToStep: step => {
        const { completedSteps } = get();
        // Only allow navigation to completed steps or the next step
        const maxAllowedStep = completedSteps.length > 0 ? Math.max(...completedSteps) + 1 : 0;

        if (step <= maxAllowedStep) {
          set({ currentStep: step });
        }
      },

      // Show data
      updateShowData: data =>
        set(state => ({
          show: { ...state.show, ...data },
          isDirty: true,
        })),

      // Trial management
      addTrial: trial =>
        set(state => ({
          trials: [
            ...state.trials,
            {
              ...trial,
              id: `trial-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              trialType: trial.trialType ?? DEFAULT_TRIAL_TYPE[state.show.organization],
            },
          ],
          isDirty: true,
        })),

      updateTrial: (id, data) =>
        set(state => ({
          trials: state.trials.map(trial => (trial.id === id ? { ...trial, ...data } : trial)),
          isDirty: true,
        })),

      removeTrial: id =>
        set(state => ({
          trials: state.trials.filter(trial => trial.id !== id),
          isDirty: true,
        })),

      reorderTrials: (startIndex, endIndex) =>
        set(state => {
          const trials = Array.from(state.trials);
          const [removed] = trials.splice(startIndex, 1);
          trials.splice(endIndex, 0, removed);
          return { trials, isDirty: true };
        }),

      // Judge management
      addJudgeToShow: (judgeId, details) =>
        set(state => ({
          show: {
            ...state.show,
            judgeIds: [...new Set([...state.show.judgeIds, judgeId])],
          },
          judgeDetails: { ...state.judgeDetails, [judgeId]: details },
          isDirty: true,
        })),

      removeJudgeFromShow: judgeId =>
        set(state => {
          const { [judgeId]: _removed, ...remainingDetails } = state.judgeDetails;
          const newAssignments = Object.entries(state.judgeAssignments)
            .filter(([, jId]) => jId !== judgeId)
            .reduce((acc, [classId, jId]) => ({ ...acc, [classId]: jId }), {});

          return {
            show: {
              ...state.show,
              judgeIds: state.show.judgeIds.filter(id => id !== judgeId),
            },
            judgeDetails: remainingDetails,
            judgeAssignments: newAssignments,
            isDirty: true,
          };
        }),

      assignJudgeToClass: (classId, judgeId) =>
        set(state => ({
          judgeAssignments: { ...state.judgeAssignments, [classId]: judgeId },
          isDirty: true,
        })),

      // State management
      setDirty: isDirty => set({ isDirty }),

      saveProgress: () =>
        set({
          lastSaved: new Date(),
          isDirty: false,
        }),

      resetWizard: () => set(initialState),

      loadDraft: draft =>
        set(state => ({
          ...state,
          ...draft,
          isDirty: false,
        })),
    }),
    {
      name: 'myk9show-wizard-storage',
      storage: createJSONStorage(() => getOptimalStorage('wizard')),
      partialize: state => ({
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        lastSaved: state.lastSaved,
        show: state.show,
        trials: state.trials,
        judgeAssignments: state.judgeAssignments,
        judgeDetails: state.judgeDetails,
      }),
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<WizardState>) };
        // Ensure officials field exists for drafts saved before this field was added
        if (!state.show.officials) {
          state.show = {
            ...state.show,
            officials: { secretary: [], chairman: [], steward: [] },
          };
        }
        // lastSaved is serialized as an ISO string by JSON.stringify; restore to Date
        if (typeof state.lastSaved === 'string') {
          state.lastSaved = new Date(state.lastSaved as unknown as string);
        }
        return state;
      },
    }
  )
);
