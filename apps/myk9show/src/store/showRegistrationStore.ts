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
import {
  createShowRegistration,
  getRegistrationByShowAndHandler,
} from '../services/database/queries/showRegistrationQueries';
import { logger } from '@myk9/core';

interface ShowRegistrationStore {
  registrations: ShowRegistration[];
  currentRegistration: ShowRegistration | null;
  draftData: Partial<RegistrationFormData>;
  registrationContext: RegistrationContext | null;

  // Registration actions
  createRegistration: (
    showId: string,
    userId: string,
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
  validateHandler: (registrationId: string, entryId: string, handlerId: string) => Promise<boolean>;

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
  submitRegistration: (registrationId: string) => Promise<void>;
  confirmRegistration: (
    registrationId: string,
    paymentReference: string
  ) => Promise<{ confirmationNumber?: string | undefined; dbRegistrationId?: string | undefined }>;
  cancelRegistration: (registrationId: string) => void;

  // Migration utilities
  migrateRegistrations: () => void;
}

export const useShowRegistrationStore = create<ShowRegistrationStore>()(
  persist(
    (set, get) => ({
      registrations: [],
      currentRegistration: null,
      draftData: {},
      registrationContext: null,

      createRegistration: (showId, userId, createdByUserId) => {
        const registration: ShowRegistration = {
          id: `reg-${Date.now()}`,
          showId,
          userId,
          status: 'draft',
          entryStatus: EntryStatus.PENDING,
          totalFees: 0,
          paymentStatus: PaymentStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date(),
          entries: [],
          statusHistory: [],
          createdByUserId: createdByUserId || userId,
          lastModifiedByUserId: createdByUserId || userId,
        };

        set(state => ({
          registrations: [...state.registrations, registration],
          currentRegistration: registration,
        }));

        return registration;
      },

      setRegistrationContext: context => {
        set({ registrationContext: context });
      },

      clearRegistrationContext: () => {
        set({ registrationContext: null });
      },

      updateRegistration: (id, updates) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === id ? { ...reg, ...updates, updatedAt: new Date() } : reg
          ),
          currentRegistration:
            state.currentRegistration?.id === id
              ? { ...state.currentRegistration, ...updates, updatedAt: new Date() }
              : state.currentRegistration,
        }));
      },

      deleteRegistration: id => {
        set(state => ({
          registrations: state.registrations.filter(reg => reg.id !== id),
          currentRegistration:
            state.currentRegistration?.id === id ? null : state.currentRegistration,
        }));
      },

      getRegistration: id => {
        return get().registrations.find(reg => reg.id === id);
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
        const newEntry: ShowEntry = {
          ...entry,
          id: `entry-${Date.now()}`,
          registrationId,
        };

        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: [...reg.entries, newEntry],
                  updatedAt: new Date(),
                }
              : reg
          ),
          currentRegistration:
            state.currentRegistration?.id === registrationId
              ? {
                  ...state.currentRegistration,
                  entries: [...state.currentRegistration.entries, newEntry],
                  updatedAt: new Date(),
                }
              : state.currentRegistration,
        }));
      },

      updateEntry: (registrationId, entryId, updates) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: reg.entries.map(entry =>
                    entry.id === entryId ? { ...entry, ...updates } : entry
                  ),
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
      },

      removeEntry: (registrationId, entryId) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: reg.entries.filter(entry => entry.id !== entryId),
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
      },

      addClassToEntry: (registrationId, entryId, classData) => {
        const newClass: ClassEntry = {
          ...classData,
          id: `class-${Date.now()}`,
          entryId,
          status: 'entered',
        };

        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: reg.entries.map(entry =>
                    entry.id === entryId
                      ? { ...entry, classes: [...entry.classes, newClass] }
                      : entry
                  ),
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
      },

      updateClassEntry: (registrationId, entryId, classId, updates) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: reg.entries.map(entry =>
                    entry.id === entryId
                      ? {
                          ...entry,
                          classes: entry.classes.map(cls =>
                            cls.id === classId ? { ...cls, ...updates } : cls
                          ),
                        }
                      : entry
                  ),
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
      },

      removeClassFromEntry: (registrationId, entryId, classId) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: reg.entries.map(entry =>
                    entry.id === entryId
                      ? {
                          ...entry,
                          classes: entry.classes.filter(cls => cls.id !== classId),
                        }
                      : entry
                  ),
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
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

        // Calculate discounts (example: 10% off for 3+ dogs)
        const discounts = [];
        if (registration.entries.length >= 3) {
          discounts.push({
            type: 'multi-dog',
            amount: subtotal * 0.1,
            description: '10% multi-dog discount',
          });
        }

        const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
        const taxes = 0; // Add tax calculation if needed
        const total = subtotal - discountTotal + taxes;

        return {
          subtotal,
          discounts,
          taxes,
          total,
          breakdown,
        };
      },

      submitRegistration: async registrationId => {
        // In a real app, this would make an API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  status: 'submitted',
                  submittedAt: new Date(),
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
      },

      confirmRegistration: async (registrationId, paymentReference) => {
        const reg = get().registrations.find(r => r.id === registrationId);
        if (!reg) return { confirmationNumber: undefined, dbRegistrationId: undefined };

        // Create or find DB registration to get real confirmation number + ID
        let confirmationNumber: string | undefined;
        let dbRegistrationId: string | undefined;
        try {
          // Check for existing registration first (add-on scenario)
          const existing = await getRegistrationByShowAndHandler(reg.showId, reg.userId);
          if (existing.data) {
            confirmationNumber = existing.data.confirmationNumber;
            dbRegistrationId = existing.data.id;
          } else {
            // Create new DB registration — trigger generates MK9-XXXXXX number
            const result = await createShowRegistration(reg.showId, reg.userId, paymentReference);
            if (result.error) {
              logger.error('[confirmRegistration] Failed to create DB registration:', result.error);
            }
            confirmationNumber = result.data?.confirmationNumber;
            dbRegistrationId = result.data?.id;
          }
        } catch (err) {
          logger.error('[confirmRegistration] Error persisting registration:', err);
        }

        // Update local state with real confirmation number (or fallback)
        set(state => ({
          registrations: state.registrations.map(r =>
            r.id === registrationId
              ? {
                  ...r,
                  status: 'confirmed' as const,
                  paymentStatus: PaymentStatus.PAID_ONLINE,
                  paymentReference,
                  confirmedAt: new Date(),
                  registrationNumber:
                    confirmationNumber ?? `REG-${Date.now().toString().slice(-6)}`,
                  updatedAt: new Date(),
                }
              : r
          ),
        }));

        return { confirmationNumber, dbRegistrationId };
      },

      cancelRegistration: registrationId => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  status: 'cancelled',
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
      },

      // Handler management
      updateEntryHandler: (registrationId, entryId, handler, overrideReason) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: reg.entries.map(entry =>
                    entry.id === entryId
                      ? {
                          ...entry,
                          handler,
                          handlerId: handler.id,
                          handlerName: handler.name,
                          isHandlerValidated: !!handler.validatedAt,
                          handlerOverrideReason: overrideReason,
                        }
                      : entry
                  ),
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
      },

      validateHandler: async (registrationId, entryId, handlerId) => {
        // In real implementation, this would check against backend
        await new Promise(resolve => setTimeout(resolve, 500));

        // For now, always return true (valid)
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: reg.entries.map(entry =>
                    entry.id === entryId && entry.handlerId === handlerId
                      ? { ...entry, isHandlerValidated: true }
                      : entry
                  ),
                }
              : reg
          ),
        }));

        return true;
      },

      // Armband management
      assignArmband: (registrationId, entryId, assignment) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === registrationId
              ? {
                  ...reg,
                  entries: reg.entries.map(entry =>
                    entry.id === entryId
                      ? {
                          ...entry,
                          armband: assignment.number,
                          armbandAssignment: assignment,
                        }
                      : entry
                  ),
                  updatedAt: new Date(),
                }
              : reg
          ),
        }));
      },

      getArmbandsByShow: showId => {
        const registrations = get().registrations.filter(reg => reg.showId === showId);
        const armbands: { entryId: string; armband: ArmbandAssignment }[] = [];

        registrations.forEach(reg => {
          reg.entries.forEach(entry => {
            if (entry.armbandAssignment) {
              armbands.push({
                entryId: entry.id,
                armband: entry.armbandAssignment,
              });
            }
          });
        });

        return armbands;
      },

      checkArmbandConflicts: (showId, armband, excludeEntryId) => {
        const armbands = get().getArmbandsByShow(showId);
        return armbands.some(
          item => item.armband.number === armband && item.entryId !== excludeEntryId
        );
      },

      // Entry status management
      updateEntryStatus: (registrationId, status, reason, userId) => {
        const reg = get().registrations.find(r => r.id === registrationId);
        if (!reg) return;

        const statusChange: StatusChange = {
          id: `change-${Date.now()}`,
          registrationId,
          changeType: 'entry_status',
          fromStatus: reg.entryStatus || EntryStatus.PENDING,
          toStatus: status,
          changedAt: new Date(),
          changedByUserId: userId || reg.userId,
          reason,
        };

        set(state => ({
          registrations: state.registrations.map(r =>
            r.id === registrationId
              ? {
                  ...r,
                  entryStatus: status,
                  statusHistory: [...(r.statusHistory || []), statusChange],
                  lastModifiedByUserId: userId || reg.userId,
                  updatedAt: new Date(),
                }
              : r
          ),
        }));
      },

      updatePaymentStatus: (registrationId, status, reference, userId) => {
        const reg = get().registrations.find(r => r.id === registrationId);
        if (!reg) return;

        const statusChange: StatusChange = {
          id: `change-${Date.now()}`,
          registrationId,
          changeType: 'payment_status',
          fromStatus: String(reg.paymentStatus),
          toStatus: status,
          changedAt: new Date(),
          changedByUserId: userId || reg.userId,
          notes: reference ? `Reference: ${reference}` : undefined,
        };

        set(state => ({
          registrations: state.registrations.map(r =>
            r.id === registrationId
              ? {
                  ...r,
                  paymentStatus: status,
                  paymentReference: reference || r.paymentReference,
                  statusHistory: [...(r.statusHistory || []), statusChange],
                  lastModifiedByUserId: userId || reg.userId,
                  updatedAt: new Date(),
                }
              : r
          ),
        }));
      },

      getStatusHistory: registrationId => {
        const reg = get().registrations.find(r => r.id === registrationId);
        return reg?.statusHistory || [];
      },

      // Migration utilities
      migrateRegistrations: () => {
        set(state => ({
          registrations: state.registrations.map(reg => {
            // Migrate payment status if needed
            const paymentStatus = isLegacyPaymentStatus(String(reg.paymentStatus))
              ? migratePaymentStatus(String(reg.paymentStatus))
              : (reg.paymentStatus as PaymentStatus);

            // Add new fields if missing
            return {
              ...reg,
              paymentStatus,
              entryStatus: reg.entryStatus || EntryStatus.PENDING,
              statusHistory: reg.statusHistory || [],
              createdByUserId: reg.createdByUserId || reg.userId,
              lastModifiedByUserId: reg.lastModifiedByUserId || reg.userId,
            };
          }),
        }));
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
        // Handle version migrations for show registrations
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.registrations && Array.isArray(state.registrations)) {
              // Ensure all registrations have proper relationships and status fields
              state.registrations = state.registrations.map((registration: unknown) => {
                const reg = registration as Record<string, unknown>;
                return {
                  ...reg,
                  // Add any data transformations needed for relationships
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
    }
  )
);
