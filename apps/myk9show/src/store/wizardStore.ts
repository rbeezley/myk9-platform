import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PREMIUM_STYLE, type PremiumStyle } from '@/types/premium-types';
import { resolveBrowserTrialTimezone } from '@/features/registries';
import { defaultTrialType } from './wizardStore.trialType';
import { stepTransitionPatch } from './wizardStore.stepTransition';
import { migrateWizardState, WIZARD_STORE_VERSION } from './wizardStore.migrations';
import { createWizardPersistStorage } from './wizardStorage';
import {
  draftToPersist,
  ensureShowDefaults,
  pickPersistedDraft,
  type PersistedWizardDraft,
} from './wizardStore.draft';

export type ShowDraft = WizardState['show'];
export type CloneHydrationStatus = 'idle' | 'hydrating' | 'ready' | 'failed';

export interface CloneHydrationState {
  status: CloneHydrationStatus;
  sourceShowId: string | null;
  sourceShowName: string | null;
  /** What the clone applied, kept for the banner's summary. Set when status is 'ready'. */
  snapshot?: CloneHydrationSnapshot | undefined;
  failureReason?: 'load-failed' | undefined;
}

export interface CloneHydrationSnapshot {
  sourceShowId: string;
  sourceShowName: string;
  show: Partial<WizardState['show']>;
  judgeDetails: WizardState['judgeDetails'];
  trials: Array<Omit<WizardState['trials'][number], 'id'>>;
}

export interface WizardState {
  currentStep: number;
  completedSteps: number[];
  isDirty: boolean;
  /** Steps the active edit mode may visit; null = all. Not persisted: set by the page. */
  allowedSteps: readonly number[] | null;
  lastSaved: Date | null;
  cloneHydration: CloneHydrationState;
  cloneGeneration: number;
  /** Name useSuggestedShowName wrote and she has not touched (MYK9-1832). Transient: a resumed draft's name is hers. */
  suggestedShowName: string | null;
  /**
   * Edit mode only: the show-level judge ids the edit draft was BUILT from.
   * The save writes the difference between this and `show.judgeIds`
   * (MYK9-772), so a judge who arrived in the store after the draft was built
   * is not "removed". Null outside edit mode (a new show only adds).
   */
  editBaselineJudgeIds: string[] | null;
  /**
   * Transient (never persisted): how many trial dates the last realignment
   * moved, shown once on the trial step and cleared when the user leaves it or
   * edits a trial (MYK9-884).
   */
  trialsMovedCount: number;
  /** The new-show draft set aside while Add trials / Add classes is open (wizardStore.draft). */
  parkedCreateDraft: PersistedWizardDraft | null;
  /** The saved draft could not be read from this device (see wizardDraftRead). */
  draftReadFailed: boolean;

  // Show data
  show: {
    name: string;
    organization: string;
    startDate: string; // ISO datetime string
    endDate: string; // ISO datetime string
    location: string;
    // Venue pin, secretary-confirmed via VenuePinMap; null = not placed
    latitude: number | null;
    longitude: number | null;
    clubId: string;
    entryOpenDate: string; // ISO datetime string
    entryCloseDate: string; // ISO datetime string
    preEntryFee: number;
    dayOfShowFee: number;
    /** Optional so drafts persisted before slice A2 still load. */
    juniorHandlerFee?: number | undefined;
    startingArmbandNumber: number;
    officials: {
      secretary: string[]; // people.id values
      chairman: string[];
      steward: string[];
    };
    judgeIds: string[]; // Judges assigned to the show
    acceptCheckPayments: boolean;
    acceptCashPayments: boolean;
    /** MYK9-979: tri-state; undefined = unknown, never written. A new show starts false. */
    onlineEntriesEnabled?: boolean | undefined;
    // IANA zone for the trials this show creates (MYK9-831). Optional so
    // existing persisted drafts without it still satisfy the type; resolved
    // to the browser's zone at draft-creation time and at save time.
    timezone?: string | undefined;
    style?: PremiumStyle | undefined;
  };

  // Trials data
  trials: Array<{
    id: string; // temp ID for wizard
    /** Present only when the secretary explicitly overrides the suggested name. */
    nameOverride?: string | undefined;
    /** The trial's day, `yyyy-MM-dd`, or '' while it has none (a cloned trial). */
    trialDate: string;
    /**
     * The start-time box exactly as typed. With `trialDate` it is joined ONLY by
     * `combineTrialDateTime`; nothing writes a default time into the date.
     */
    startTimeDraft?: string | undefined;
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
  setAllowedSteps: (steps: readonly number[] | null) => void;
  markStepCompleted: (step: number) => void;
  goToStep: (step: number) => void;

  // Show data
  updateShowData: (data: Partial<WizardState['show']>) => void;
  setSuggestedShowName: (name: string | null) => void;

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
  beginCloneHydration: (sourceShowId: string, sourceShowName: string) => number;
  failCloneHydration: (generation: number) => void;
  cancelCloneHydration: (generation: number) => void;
  completeCloneHydration: (generation: number, snapshot: CloneHydrationSnapshot) => void;
  saveProgress: () => void;
  resetWizard: () => void;
  loadDraft: (draft: Partial<WizardState>) => void;
  /** `loadDraft` for Add trials / Add classes: sets the new-show draft aside first. */
  loadEditDraft: (draft: Partial<WizardState>) => void;
  /** Puts the set-aside new-show draft back. A no-op outside an edit visit. */
  endEditVisit: () => void;
}

const wizardPersistStorage = createWizardPersistStorage<unknown>();

function loadDraftPatch(state: WizardState, draft: Partial<WizardState>) {
  return ensureShowDefaults({
    ...state,
    ...draft,
    cloneGeneration: state.cloneGeneration + 1,
    suggestedShowName: null,
    cloneHydration: initialState.cloneHydration,
    trialsMovedCount: 0,
    isDirty: false,
  });
}

const initialState: WizardState = {
  currentStep: 0,
  completedSteps: [],
  isDirty: false,
  allowedSteps: null,
  lastSaved: null,
  cloneHydration: { status: 'idle', sourceShowId: null, sourceShowName: null },
  cloneGeneration: 0,
  suggestedShowName: null,
  editBaselineJudgeIds: null,
  trialsMovedCount: 0,
  parkedCreateDraft: null,
  draftReadFailed: false,
  show: {
    name: '',
    organization: 'AKC',
    startDate: '',
    endDate: '',
    location: '',
    latitude: null,
    longitude: null,
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
    // A new show takes check and cash unless she says otherwise (owner decision, MYK9-1799):
    // every club so far does, and a show accepting nothing cannot be entered. Online entries
    // stay off; they need the club's payout account.
    acceptCheckPayments: true,
    acceptCashPayments: true,
    onlineEntriesEnabled: false,
    timezone: resolveBrowserTrialTimezone(),
    style: DEFAULT_PREMIUM_STYLE,
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
      setCurrentStep: step =>
        set(state =>
          state.cloneHydration.status === 'hydrating' ||
          (state.allowedSteps !== null && !state.allowedSteps.includes(step))
            ? state
            : stepTransitionPatch(state, step)
        ),

      setAllowedSteps: steps => set({ allowedSteps: steps }),

      markStepCompleted: step => {
        if (get().cloneHydration.status === 'hydrating') return;
        const { completedSteps } = get();
        if (completedSteps.includes(step)) return;
        set({ completedSteps: [...completedSteps, step].sort((a, b) => a - b) });
      },

      goToStep: step => {
        const { completedSteps, cloneHydration } = get();
        if (cloneHydration.status === 'hydrating') return;
        // Only allow navigation to completed steps or the next step
        const maxAllowedStep = completedSteps.length > 0 ? Math.max(...completedSteps) + 1 : 0;

        const { allowedSteps } = get();
        if (allowedSteps !== null && !allowedSteps.includes(step)) return;

        if (step <= maxAllowedStep) {
          set(state => stepTransitionPatch(state, step));
        }
      },

      // Show data
      updateShowData: data =>
        set(state => ({
          show: { ...state.show, ...data },
          isDirty: true,
        })),

      setSuggestedShowName: name => set({ suggestedShowName: name }),

      // Trial management
      addTrial: trial =>
        set(state => ({
          trials: [
            ...state.trials,
            {
              ...trial,
              id: `trial-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              trialType: trial.trialType ?? defaultTrialType(state.show.organization),
            },
          ],
          trialsMovedCount: 0,
          isDirty: true,
        })),

      updateTrial: (id, data) =>
        set(state => ({
          trials: state.trials.map(trial => (trial.id === id ? { ...trial, ...data } : trial)),
          trialsMovedCount: 0,
          isDirty: true,
        })),

      removeTrial: id =>
        set(state => ({
          trials: state.trials.filter(trial => trial.id !== id),
          trialsMovedCount: 0,
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

      beginCloneHydration: (sourceShowId, sourceShowName) => {
        const generation = get().cloneGeneration + 1;
        set({
          cloneGeneration: generation,
          cloneHydration: { status: 'hydrating', sourceShowId, sourceShowName },
        });
        return generation;
      },

      failCloneHydration: generation =>
        set(state => {
          if (state.cloneGeneration !== generation || state.cloneHydration.status !== 'hydrating') {
            return state;
          }
          return {
            cloneHydration: {
              ...state.cloneHydration,
              status: 'failed',
              failureReason: 'load-failed',
            },
          };
        }),

      // Cancels a pending clone or dismisses a failed one; the draft is never touched.
      cancelCloneHydration: generation =>
        set(state => {
          const { status } = state.cloneHydration;
          if (
            state.cloneGeneration !== generation ||
            (status !== 'hydrating' && status !== 'failed')
          ) {
            return state;
          }
          return {
            cloneGeneration: state.cloneGeneration + 1,
            cloneHydration: initialState.cloneHydration,
          };
        }),

      completeCloneHydration: (generation, snapshot) =>
        set(state => {
          if (
            state.cloneGeneration !== generation ||
            state.cloneHydration.status !== 'hydrating' ||
            state.cloneHydration.sourceShowId !== snapshot.sourceShowId
          ) {
            return state;
          }

          const show = { ...initialState.show, ...snapshot.show };
          return {
            ...initialState,
            cloneGeneration: generation,
            cloneHydration: {
              status: 'ready',
              sourceShowId: snapshot.sourceShowId,
              sourceShowName: snapshot.sourceShowName,
              snapshot,
            },
            show,
            judgeDetails: snapshot.judgeDetails,
            // Same default addTrial applies: a legacy source trial without a type.
            trials: snapshot.trials.map(trial => ({
              ...trial,
              id: `trial-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              trialType: trial.trialType ?? defaultTrialType(show.organization),
            })),
            isDirty: true,
          };
        }),

      saveProgress: () =>
        set({
          lastSaved: new Date(),
          isDirty: false,
        }),

      // A reset inside an edit visit clears that visit's work, never the draft set aside for it.
      resetWizard: () =>
        set(state => ({
          ...initialState,
          draftReadFailed: state.draftReadFailed,
          parkedCreateDraft: state.parkedCreateDraft,
          cloneGeneration: state.cloneGeneration + 1,
        })),

      loadDraft: draft => set(state => loadDraftPatch(state, draft)),

      // A second edit visit in a row keeps the draft the first one set aside.
      loadEditDraft: draft =>
        set(state => ({
          ...loadDraftPatch(state, draft),
          parkedCreateDraft: state.parkedCreateDraft ?? pickPersistedDraft(state),
        })),

      endEditVisit: () =>
        set(state =>
          state.parkedCreateDraft === null
            ? state
            : ensureShowDefaults({
                ...state,
                ...initialState,
                ...state.parkedCreateDraft,
                draftReadFailed: state.draftReadFailed,
                cloneGeneration: state.cloneGeneration + 1,
              })
        ),
    }),
    {
      name: 'myk9show-wizard-storage',
      version: WIZARD_STORE_VERSION,
      migrate: migrateWizardState,
      // Debounced: every keystroke `set`s, but only the last draft per window is written.
      storage: wizardPersistStorage,
      partialize: state => draftToPersist(state),
      onRehydrateStorage: () => (_state, error) => noteDraftReadResult(error),
      merge: (persisted, current) => {
        // The disk holds the set-aside new-show draft during an edit visit; a late or repeated
        // read must not lay it over the edit draft on screen.
        if (current.parkedCreateDraft !== null) return current;
        const state = ensureShowDefaults({
          ...current,
          ...(persisted as Partial<WizardState>),
          cloneHydration: initialState.cloneHydration,
          cloneGeneration: current.cloneGeneration,
        });
        // Zustand persist serializes Date via JSON.stringify → ISO string.
        const rawLastSaved: unknown = state.lastSaved;
        if (typeof rawLastSaved === 'string') {
          state.lastSaved = new Date(rawLastSaved);
        }
        return state;
      },
    }
  )
);

/** Deferred a microtask: a synchronous storage would call this before the store exists. */
function noteDraftReadResult(error: unknown): void {
  if (error !== undefined) queueMicrotask(() => useWizardStore.setState({ draftReadFailed: true }));
}
