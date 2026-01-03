import { describe, it, expect, beforeEach } from 'vitest';
import { useShowRegistrationStore } from '../../store/showRegistrationStore';
import { 
  EntryStatus, 
  PaymentStatus, 
  Handler,
  ArmbandAssignment 
} from '../../types/show-registration-types';
import { needsMigration, migrateRegistration } from '../../lib/registrationMigration';

describe('Enhanced ShowRegistrationStore', () => {
  beforeEach(() => {
    // Clear the store before each test
    useShowRegistrationStore.setState({
      registrations: [],
      currentRegistration: null,
      draftData: {},
      registrationContext: null
    });
  });

  describe('Registration Context', () => {
    it('should set and clear registration context', () => {
      const store = useShowRegistrationStore.getState();
      
      const context = {
        mode: 'secretary_existing' as const,
        permissions: ['registration:view_all_dogs', 'registration:register_any'],
        scopedClubs: ['club-1', 'club-2'],
        showId: 'show-123',
        userId: 'user-456'
      };
      
      store.setRegistrationContext(context);
      expect(useShowRegistrationStore.getState().registrationContext).toEqual(context);
      
      store.clearRegistrationContext();
      expect(useShowRegistrationStore.getState().registrationContext).toBeNull();
    });
  });

  describe('Enhanced Registration Creation', () => {
    it('should create registration with new fields', () => {
      const store = useShowRegistrationStore.getState();
      
      const registration = store.createRegistration('show-123', 'user-456', 'secretary-789');
      
      expect(registration.entryStatus).toBe(EntryStatus.PENDING);
      expect(registration.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(registration.statusHistory).toEqual([]);
      expect(registration.createdByUserId).toBe('secretary-789');
      expect(registration.lastModifiedByUserId).toBe('secretary-789');
    });
  });

  describe('Handler Management', () => {
    it('should update entry handler with validation', () => {
      const store = useShowRegistrationStore.getState();
      
      const registration = store.createRegistration('show-123', 'user-456');
      store.addEntry(registration.id, {
        dogId: 'dog-123',
        dogName: 'Max',
        trialId: 'trial-123',
        trialName: 'Morning Trial',
        classes: [],
        handlerName: 'John Doe'
      });
      
      // Get the updated registration after adding entry
      const regWithEntry = store.getRegistration(registration.id)!;
      const entry = regWithEntry.entries[0];
      const handler: Handler = {
        id: 'handler-123',
        name: 'Jane Smith',
        email: 'jane@example.com',
        isOwner: false,
        validatedAt: new Date()
      };
      
      store.updateEntryHandler(registration.id, entry.id, handler, 'Owner unavailable');
      
      const updatedReg = store.getRegistration(registration.id);
      const updatedEntry = updatedReg?.entries[0];
      
      expect(updatedEntry?.handler).toEqual(handler);
      expect(updatedEntry?.handlerName).toBe('Jane Smith');
      expect(updatedEntry?.isHandlerValidated).toBe(true);
      expect(updatedEntry?.handlerOverrideReason).toBe('Owner unavailable');
    });
  });

  describe('Armband Management', () => {
    it('should assign armbands and check conflicts', () => {
      const store = useShowRegistrationStore.getState();
      
      const registration = store.createRegistration('show-123', 'user-456');
      store.addEntry(registration.id, {
        dogId: 'dog-123',
        dogName: 'Max',
        trialId: 'trial-123',
        trialName: 'Morning Trial',
        classes: [],
        handlerName: 'John Doe'
      });
      
      // Get the updated registration after adding entry
      const regWithEntry = store.getRegistration(registration.id)!;
      const entry = regWithEntry.entries[0];
      const armband: ArmbandAssignment = {
        number: 'A-101',
        showDay: new Date('2024-06-01'),
        trialId: 'trial-123',
        prefix: 'A',
        rangeStart: 100,
        rangeEnd: 199
      };
      
      store.assignArmband(registration.id, entry.id, armband);
      
      // Check assignment
      const armbands = store.getArmbandsByShow('show-123');
      expect(armbands).toHaveLength(1);
      expect(armbands[0].armband).toEqual(armband);
      
      // Check conflicts
      expect(store.checkArmbandConflicts('show-123', 'A-101')).toBe(true);
      expect(store.checkArmbandConflicts('show-123', 'A-102')).toBe(false);
      expect(store.checkArmbandConflicts('show-123', 'A-101', entry.id)).toBe(false);
    });
  });

  describe('Status Management', () => {
    it('should track entry status changes', () => {
      const store = useShowRegistrationStore.getState();
      
      const registration = store.createRegistration('show-123', 'user-456');
      
      store.updateEntryStatus(
        registration.id, 
        EntryStatus.ACCEPTED, 
        'All requirements met',
        'secretary-789'
      );
      
      const updated = store.getRegistration(registration.id);
      expect(updated?.entryStatus).toBe(EntryStatus.ACCEPTED);
      
      const history = store.getStatusHistory(registration.id);
      expect(history).toHaveLength(1);
      expect(history[0].changeType).toBe('entry_status');
      expect(history[0].fromStatus).toBe(EntryStatus.PENDING);
      expect(history[0].toStatus).toBe(EntryStatus.ACCEPTED);
      expect(history[0].reason).toBe('All requirements met');
      expect(history[0].changedByUserId).toBe('secretary-789');
    });

    it('should track payment status changes', () => {
      const store = useShowRegistrationStore.getState();
      
      const registration = store.createRegistration('show-123', 'user-456');
      
      store.updatePaymentStatus(
        registration.id,
        PaymentStatus.PAID_BY_CHECK,
        'CHK-12345',
        'secretary-789'
      );
      
      const updated = store.getRegistration(registration.id);
      expect(updated?.paymentStatus).toBe(PaymentStatus.PAID_BY_CHECK);
      expect(updated?.paymentReference).toBe('CHK-12345');
      
      const history = store.getStatusHistory(registration.id);
      expect(history).toHaveLength(1);
      expect(history[0].changeType).toBe('payment_status');
      expect(history[0].notes).toBe('Reference: CHK-12345');
    });
  });

  describe('Migration', () => {
    it('should detect registrations needing migration', () => {
      const oldRegistration = {
        id: 'reg-old',
        showId: 'show-123',
        userId: 'user-456',
        status: 'draft',
        paymentStatus: 'paid', // Legacy status
        entries: []
      };
      
      expect(needsMigration(oldRegistration)).toBe(true);
    });

    it('should migrate legacy registrations', () => {
      const oldRegistration = {
        id: 'reg-old',
        showId: 'show-123',
        userId: 'user-456',
        status: 'confirmed',
        paymentStatus: 'paid',
        entries: [{
          id: 'entry-1',
          dogId: 'dog-123',
          handlerName: 'John Doe'
        }]
      };
      
      const migrated = migrateRegistration(oldRegistration);
      
      expect(migrated.paymentStatus).toBe(PaymentStatus.PAID_ONLINE);
      expect(migrated.entryStatus).toBe(EntryStatus.PENDING);
      expect(migrated.statusHistory).toEqual([]);
      expect(migrated.createdByUserId).toBe('user-456');
      expect(migrated.entries[0].isHandlerValidated).toBe(false);
    });
  });
});