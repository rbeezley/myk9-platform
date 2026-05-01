import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import {
  ShowRegistration,
  ShowEntry,
  ClassEntry,
  RegistrationFormData,
  FeeCalculation,
  EntryStatus,
  PaymentStatus,
  StatusChange,
  Handler,
  ArmbandAssignment,
  RegistrationContext,
  migratePaymentStatus,
  isLegacyPaymentStatus,
} from '../types/show-registration-types';
import type { PaymentDetails } from '../types/show-registration-types';
import {
  createShowRegistration,
  getRegistrationByShowAndHandler,
} from '../services/database/queries/showRegistrationQueries';
import { supabase } from '@/lib/supabase';
import { logger } from '@myk9/core';
import {
  buildRegistrationIndexes,
  emptyRegistrationIndexes,
  reassembleRegistration,
  type StoredShowRegistration,
  type StoredShowEntry,
} from './buildRegistrationIndexes';
import { selectArmbandsByShow, selectArmbandConflict } from './showRegistrationSelectors';

interface ShowRegistrationStore {
  registrations: ShowRegistration[];
  currentRegistration: ShowRegistration | null;
  draftData: Partial<RegistrationFormData>;
  registrationContext: RegistrationContext | null;
  // Canonical byId indexes — mutators write here first; registrations[] and
  // currentRegistration are derived via withDerived after every mutation.
  registrationsById: Record<string, StoredShowRegistration>;
  entriesById: Record<string, StoredShowEntry>;
  classesById: Record<string, ClassEntry>;
  currentRegistrationId: string | null;

  // Registration actions
  createRegistration: (
    showId: string,
    userId: string,
    handlerId: string,
    createdByUserId?: string
  ) => ShowRegistration;
  updateRegistration: (id: string, updates: Partial<ShowRegistration>) => void;
  deleteRegistration: (id: string) => void;
  getRegistration: (id: string) => ShowRegistration | undefined;
  getRegistrationsByShow: (showId: string) => ShowRegistration[];
  getRegistrationsByUser: (userId: string) => ShowRegistration[];

  // Registration context
  setRegistrationContext: (context: RegistrationContext) => void;
  clearRegistrationContext: () => void;

  // Draft management
  setDraftData: (data: Partial<RegistrationFormData>) => void;
  clearDraftData: () => void;

  // Entry management
  addEntry: (registrationId: string, entry: Omit<ShowEntry, 'id' | 'registrationId'>) => void;
  updateEntry: (registrationId: string, entryId: string, updates: Partial<ShowEntry>) => void;
  removeEntry: (registrationId: string, entryId: string) => void;

  // Handler management
  updateEntryHandler: (
    registrationId: string,
    entryId: string,
    handler: Handler,
    overrideReason?: string
  ) => void;

  // Armband management
  assignArmband: (registrationId: string, entryId: string, assignment: ArmbandAssignment) => void;
  getArmbandsByShow: (showId: string) => { entryId: string; armband: ArmbandAssignment }[];
  checkArmbandConflicts: (showId: string, armband: string, excludeEntryId?: string) => boolean;

  // Class management
  addClassToEntry: (
    registrationId: string,
    entryId: string,
    classData: Omit<ClassEntry, 'id' | 'entryId'>
  ) => void;
  updateClassEntry: (
    registrationId: string,
    entryId: string,
    classId: string,
    updates: Partial<ClassEntry>
  ) => void;
  removeClassFromEntry: (registrationId: string, entryId: string, classId: string) => void;

  // Entry status management
  updateEntryStatus: (
    registrationId: string,
    status: EntryStatus,
    reason?: string,
    userId?: string
  ) => void;
  updatePaymentStatus: (
    registrationId: string,
    status: PaymentStatus,
    reference?: string,
    userId?: string
  ) => void;
  getStatusHistory: (registrationId: string) => StatusChange[];

  // Fee calculation
  calculateFees: (registration: ShowRegistration) => FeeCalculation;

  // Submission
  submitRegistration: (registrationId: string, paymentDetails?: PaymentDetails) => Promise<void>;
  confirmRegistration: (
    registrationId: string,
    paymentReference: string,
    paymentDetails?: PaymentDetails
  ) => Promise<{ confirmationNumber?: string | undefined; dbRegistrationId?: string | undefined }>;
  cancelRegistration: (registrationId: string) => void;

  // Migration utilities
  migrateRegistrations: () => void;
}

// Derives registrations[] and currentRegistration from the byId canonical state.
// Every mutator calls this so the backward-compat fields stay in sync atomically.
const withDerived = (
  partial: Partial<ShowRegistrationStore>,
  state: ShowRegistrationStore
): Partial<ShowRegistrationStore> => {
  const merged = { ...state, ...partial };
  const registrations = Object.values(merged.registrationsById).map(r =>
    reassembleRegistration(r, merged.entriesById, merged.classesById)
  );
  return {
    ...partial,
    registrations,
    currentRegistration:
      merged.currentRegistrationId != null
        ? (registrations.find(r => r.id === merged.currentRegistrationId) ?? null)
        : null,
  };
};

// Bumps updatedAt on a registration without touching entries/classes.
// Returns an empty object (no-op) when the registration doesn't exist.
const bumpReg = (
  state: ShowRegistrationStore,
  registrationId: string
): Partial<ShowRegistrationStore> => {
  const reg = state.registrationsById[registrationId];
  if (!reg) return {};
  return {
    registrationsById: {
      ...state.registrationsById,
      [registrationId]: { ...reg, updatedAt: new Date() },
    },
  };
};

export const useShowRegistrationStore = create<ShowRegistrationStore>()(
  persist(
    (set, get) => ({
      registrations: [],
      currentRegistration: null,
      draftData: {},
      registrationContext: null,
      ...emptyRegistrationIndexes(),
      currentRegistrationId: null,

      createRegistration: (showId, userId, handlerId, createdByUserId) => {
        const id = `reg-${Date.now()}`;
        const stored: StoredShowRegistration = {
          id,
          showId,
          userId,
          handlerId,
          status: 'draft',
          entryStatus: EntryStatus.PENDING,
          totalFees: 0,
          paymentStatus: PaymentStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          statusHistory: [],
          createdByUserId: createdByUserId || userId,
          lastModifiedByUserId: createdByUserId || userId,
        };

        set(state =>
          withDerived(
            {
              registrationsById: { ...state.registrationsById, [id]: stored },
              currentRegistrationId: id,
            },
            state
          )
        );

        return { ...stored, entries: [] };
      },

      setRegistrationContext: context => {
        set({ registrationContext: context });
      },

      clearRegistrationContext: () => {
        set({ registrationContext: null });
      },

      updateRegistration: (id, updates) => {
        set(state => {
          const existing = state.registrationsById[id];
          if (!existing) return state;
          const { entries: _e, ...safeUpdates } = updates as Partial<ShowRegistration>;
          return withDerived(
            {
              registrationsById: {
                ...state.registrationsById,
                [id]: { ...existing, ...safeUpdates, updatedAt: new Date() },
              },
            },
            state
          );
        });
      },

      deleteRegistration: id => {
        set(state => {
          const entryIds = new Set(
            Object.values(state.entriesById)
              .filter(e => e.registrationId === id)
              .map(e => e.id)
          );
          return withDerived(
            {
              registrationsById: Object.fromEntries(
                Object.entries(state.registrationsById).filter(([k]) => k !== id)
              ),
              entriesById: Object.fromEntries(
                Object.entries(state.entriesById).filter(([, e]) => e.registrationId !== id)
              ),
              classesById: Object.fromEntries(
                Object.entries(state.classesById).filter(([, c]) => !entryIds.has(c.entryId))
              ),
              currentRegistrationId:
                state.currentRegistrationId === id ? null : state.currentRegistrationId,
            },
            state
          );
        });
      },

      getRegistration: id => {
        const state = get();
        const stored = state.registrationsById[id];
        if (!stored) return undefined;
        return reassembleRegistration(stored, state.entriesById, state.classesById);
      },

      getRegistrationsByShow: showId => {
        return get().registrations.filter(reg => reg.showId === showId);
      },

      getRegistrationsByUser: userId => {
        return get().registrations.filter(reg => reg.userId === userId);
      },

      setDraftData: data => {
        set(state => ({
          draftData: { ...state.draftData, ...data },
        }));
      },

      clearDraftData: () => {
        set({ draftData: {} });
      },

      addEntry: (registrationId, entry) => {
        const entryId = `entry-${Date.now()}`;
        const { classes = [], ...restEntry } = entry;
        const stored: StoredShowEntry = { ...restEntry, id: entryId, registrationId };

        const newClasses: Record<string, ClassEntry> = {};
        for (const cls of classes) {
          newClasses[cls.id] = { ...cls, entryId };
        }

        set(state =>
          withDerived(
            {
              entriesById: { ...state.entriesById, [entryId]: stored },
              classesById: { ...state.classesById, ...newClasses },
              ...bumpReg(state, registrationId),
            },
            state
          )
        );
      },

      updateEntry: (registrationId, entryId, updates) => {
        set(state => {
          const existing = state.entriesById[entryId];
          if (!existing) return state;
          const { classes: _c, ...safeUpdates } = updates as Partial<ShowEntry>;
          return withDerived(
            {
              entriesById: { ...state.entriesById, [entryId]: { ...existing, ...safeUpdates } },
              ...bumpReg(state, registrationId),
            },
            state
          );
        });
      },

      removeEntry: (registrationId, entryId) => {
        set(state =>
          withDerived(
            {
              entriesById: Object.fromEntries(
                Object.entries(state.entriesById).filter(([k]) => k !== entryId)
              ),
              classesById: Object.fromEntries(
                Object.entries(state.classesById).filter(([, c]) => c.entryId !== entryId)
              ),
              ...bumpReg(state, registrationId),
            },
            state
          )
        );
      },

      addClassToEntry: (registrationId, entryId, classData) => {
        const classId = `class-${Date.now()}`;
        const newClass: ClassEntry = {
          ...classData,
          id: classId,
          entryId,
          status: 'entered',
        };

        set(state =>
          withDerived(
            {
              classesById: { ...state.classesById, [classId]: newClass },
              ...bumpReg(state, registrationId),
            },
            state
          )
        );
      },

      updateClassEntry: (registrationId, _entryId, classId, updates) => {
        set(state => {
          const existing = state.classesById[classId];
          if (!existing) return state;
          return withDerived(
            {
              classesById: { ...state.classesById, [classId]: { ...existing, ...updates } },
              ...bumpReg(state, registrationId),
            },
            state
          );
        });
      },

      removeClassFromEntry: (registrationId, _entryId, classId) => {
        set(state =>
          withDerived(
            {
              classesById: Object.fromEntries(
                Object.entries(state.classesById).filter(([k]) => k !== classId)
              ),
              ...bumpReg(state, registrationId),
            },
            state
          )
        );
      },

      calculateFees: registration => {
        const breakdown = registration.entries.map(entry => {
          const classes = entry.classes.map(cls => ({
            className: cls.className,
            fee: cls.fee,
          }));

          const subtotal = classes.reduce((sum, cls) => sum + cls.fee, 0);

          return {
            dogId: entry.dogId,
            dogName: entry.dogName,
            classes,
            subtotal,
          };
        });

        const subtotal = breakdown.reduce((sum, item) => sum + item.subtotal, 0);

        const discounts = [];
        if (registration.entries.length >= 3) {
          discounts.push({
            type: 'multi-dog',
            amount: subtotal * 0.1,
            description: '10% multi-dog discount',
          });
        }

        const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
        const taxes = 0;
        const total = subtotal - discountTotal + taxes;

        return {
          subtotal,
          discounts,
          taxes,
          total,
          breakdown,
        };
      },

      submitRegistration: async (registrationId, paymentDetails) => {
        await new Promise(resolve => setTimeout(resolve, 1000));

        set(state => {
          const existing = state.registrationsById[registrationId];
          if (!existing) return state;
          return withDerived(
            {
              registrationsById: {
                ...state.registrationsById,
                [registrationId]: {
                  ...existing,
                  status: 'submitted' as const,
                  submittedAt: new Date(),
                  updatedAt: new Date(),
                  // Store payment details locally for confirmation step display
                  ...(paymentDetails && { paymentDetails }),
                },
              },
            },
            state
          );
        });
      },

      confirmRegistration: async (registrationId, paymentReference, paymentDetails) => {
        const reg = get().registrationsById[registrationId];
        if (!reg) return { confirmationNumber: undefined, dbRegistrationId: undefined };

        // Files the enrollment under the dog's owner (set at createRegistration
        // time from the wizard's selectedDogsOwner resolution). Falls back to
        // userId for any draft persisted before the handlerId field existed.
        const handlerId = reg.handlerId ?? reg.userId;

        let confirmationNumber: string | undefined;
        let dbRegistrationId: string | undefined;
        try {
          const existing = await getRegistrationByShowAndHandler(reg.showId, handlerId);
          if (existing.data) {
            confirmationNumber = existing.data.confirmationNumber;
            dbRegistrationId = existing.data.id;
          } else {
            const result = await createShowRegistration(
              reg.showId,
              handlerId,
              paymentReference,
              paymentDetails
            );
            if (result.error) {
              logger.error('[confirmRegistration] Failed to create DB registration:', result.error);
            }
            confirmationNumber = result.data?.confirmationNumber;
            dbRegistrationId = result.data?.id;
          }
        } catch (err) {
          logger.error('[confirmRegistration] Error persisting registration:', err);
        }

        set(state => {
          const existing = state.registrationsById[registrationId];
          if (!existing) return state;
          return withDerived(
            {
              registrationsById: {
                ...state.registrationsById,
                [registrationId]: {
                  ...existing,
                  status: 'confirmed' as const,
                  paymentStatus: PaymentStatus.PAID_ONLINE,
                  paymentReference,
                  confirmedAt: new Date(),
                  registrationNumber:
                    confirmationNumber ?? `REG-${Date.now().toString().slice(-6)}`,
                  updatedAt: new Date(),
                },
              },
            },
            state
          );
        });

        if (dbRegistrationId) {
          supabase.functions
            .invoke('send-registration-email', {
              body: { registrationId: dbRegistrationId },
            })
            .catch(err => {
              logger.error('[confirmRegistration] Failed to send confirmation email:', err);
            });
        }

        return { confirmationNumber, dbRegistrationId };
      },

      cancelRegistration: registrationId => {
        set(state => {
          const existing = state.registrationsById[registrationId];
          if (!existing) return state;
          return withDerived(
            {
              registrationsById: {
                ...state.registrationsById,
                [registrationId]: {
                  ...existing,
                  status: 'cancelled' as const,
                  updatedAt: new Date(),
                },
              },
            },
            state
          );
        });
      },

      updateEntryHandler: (registrationId, entryId, handler, overrideReason) => {
        set(state => {
          const existing = state.entriesById[entryId];
          if (!existing) return state;
          return withDerived(
            {
              entriesById: {
                ...state.entriesById,
                [entryId]: {
                  ...existing,
                  handler,
                  handlerId: handler.id,
                  handlerName: handler.name,
                  isHandlerValidated: !!handler.validatedAt,
                  handlerOverrideReason: overrideReason,
                },
              },
              ...bumpReg(state, registrationId),
            },
            state
          );
        });
      },

      assignArmband: (registrationId, entryId, assignment) => {
        set(state => {
          const existing = state.entriesById[entryId];
          if (!existing) return state;
          return withDerived(
            {
              entriesById: {
                ...state.entriesById,
                [entryId]: {
                  ...existing,
                  armband: assignment.number,
                  armbandAssignment: assignment,
                },
              },
              ...bumpReg(state, registrationId),
            },
            state
          );
        });
      },

      getArmbandsByShow: showId => selectArmbandsByShow(get(), showId),

      checkArmbandConflicts: (showId, armband, excludeEntryId) =>
        selectArmbandConflict(get(), showId, armband, excludeEntryId),

      updateEntryStatus: (registrationId, status, reason, userId) => {
        set(state => {
          const existing = state.registrationsById[registrationId];
          if (!existing) return state;
          const statusChange: StatusChange = {
            id: `change-${Date.now()}`,
            registrationId,
            changeType: 'entry_status',
            fromStatus: existing.entryStatus || EntryStatus.PENDING,
            toStatus: status,
            changedAt: new Date(),
            changedByUserId: userId || existing.userId,
            reason,
          };
          return withDerived(
            {
              registrationsById: {
                ...state.registrationsById,
                [registrationId]: {
                  ...existing,
                  entryStatus: status,
                  statusHistory: [...(existing.statusHistory || []), statusChange],
                  lastModifiedByUserId: userId || existing.userId,
                  updatedAt: new Date(),
                },
              },
            },
            state
          );
        });
      },

      updatePaymentStatus: (registrationId, status, reference, userId) => {
        set(state => {
          const existing = state.registrationsById[registrationId];
          if (!existing) return state;
          const statusChange: StatusChange = {
            id: `change-${Date.now()}`,
            registrationId,
            changeType: 'payment_status',
            fromStatus: String(existing.paymentStatus),
            toStatus: status,
            changedAt: new Date(),
            changedByUserId: userId || existing.userId,
            notes: reference ? `Reference: ${reference}` : undefined,
          };
          return withDerived(
            {
              registrationsById: {
                ...state.registrationsById,
                [registrationId]: {
                  ...existing,
                  paymentStatus: status,
                  paymentReference: reference || existing.paymentReference,
                  statusHistory: [...(existing.statusHistory || []), statusChange],
                  lastModifiedByUserId: userId || existing.userId,
                  updatedAt: new Date(),
                },
              },
            },
            state
          );
        });
      },

      getStatusHistory: registrationId => {
        const reg = get().registrationsById[registrationId];
        return reg?.statusHistory ?? [];
      },

      migrateRegistrations: () => {
        set(state => {
          const registrationsById: Record<string, StoredShowRegistration> = {};
          for (const [id, reg] of Object.entries(state.registrationsById)) {
            const paymentStatus = isLegacyPaymentStatus(String(reg.paymentStatus))
              ? migratePaymentStatus(String(reg.paymentStatus))
              : (reg.paymentStatus as PaymentStatus);

            registrationsById[id] = {
              ...reg,
              paymentStatus,
              entryStatus: reg.entryStatus || EntryStatus.PENDING,
              statusHistory: reg.statusHistory || [],
              createdByUserId: reg.createdByUserId || reg.userId,
              lastModifiedByUserId: reg.lastModifiedByUserId || reg.userId,
            };
          }
          return withDerived({ registrationsById }, state);
        });
      },
    }),
    {
      name: 'show-registration-storage',
      storage: createJSONStorage(() => getOptimalStorage('showRegistrations')),
      partialize: state => ({
        registrations: state.registrations,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.registrations && Array.isArray(state.registrations)) {
              state.registrations = state.registrations.map((registration: unknown) => {
                const reg = registration as Record<string, unknown>;
                return {
                  ...reg,
                  entryStatus: reg.entryStatus || 'pending',
                  statusHistory: reg.statusHistory || [],
                  createdByUserId: reg.createdByUserId || reg.userId,
                  lastModifiedByUserId: reg.lastModifiedByUserId || reg.userId,
                };
              });
            }
          }
        }
        return persistedState;
      },
      onRehydrateStorage: () => state => {
        if (!state) return;
        const indexes = buildRegistrationIndexes(state.registrations);
        state.registrationsById = indexes.registrationsById;
        state.entriesById = indexes.entriesById;
        state.classesById = indexes.classesById;
        state.currentRegistrationId = state.currentRegistration?.id ?? null;
      },
    }
  )
);
