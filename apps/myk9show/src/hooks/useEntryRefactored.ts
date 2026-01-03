/**
 * React hooks for the refactored entry system
 * Using the new split-table design: Entry + ClassEntry
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import type {
  Entry,
  ClassEntry,
  EntryWithClasses,
  CreateEntryInput,
  UpdateEntryInput,
  CreateClassEntryInput,
  UpdateClassEntryInput,
  EntryFilters,
  ClassEntryFilters,
  EntrySummary,
  ClassEntrySummary
} from '@/types/entry-refactored-types';

// Type aliases for database types
type DbEntry = Database['public']['Tables']['entry']['Row'];
type DbClassEntry = Database['public']['Tables']['class_entry']['Row'];
type DbEntryInsert = Database['public']['Tables']['entry']['Insert'];
type DbClassEntryInsert = Database['public']['Tables']['class_entry']['Insert'];
type DbEntryUpdate = Database['public']['Tables']['entry']['Update'];
type DbClassEntryUpdate = Database['public']['Tables']['class_entry']['Update'];

// ============================================================================
// Helper Functions
// ============================================================================

const mapDbEntryToEntry = (dbEntry: DbEntry): Entry => ({
  id: dbEntry.id,
  dogId: dbEntry.dog_id!,
  handlerId: dbEntry.handler_id!,
  showId: dbEntry.show_id!,
  entryStatus: (dbEntry.entry_status as Entry['entryStatus']) || 'draft',
  paymentStatus: (dbEntry.payment_status as Entry['paymentStatus']) || 'pending',
  totalFees: dbEntry.total_fees || 0,
  specialRequests: dbEntry.special_requests || undefined,
  moveUpRequested: dbEntry.move_up_requested || false,
  submittedAt: dbEntry.submitted_at ? new Date(dbEntry.submitted_at) : undefined,
  createdAt: new Date(dbEntry.created_at!),
  updatedAt: new Date(dbEntry.updated_at!),
  createdBy: dbEntry.created_by || undefined,
  updatedBy: dbEntry.updated_by || undefined
});

const mapDbClassEntryToClassEntry = (dbClassEntry: DbClassEntry): ClassEntry => ({
  id: dbClassEntry.id,
  entryId: dbClassEntry.entry_id,
  classId: dbClassEntry.class_id,
  trialId: dbClassEntry.trial_id,
  armband: dbClassEntry.armband || undefined,
  runOrder: dbClassEntry.run_order || undefined,
  jumpHeight: dbClassEntry.jump_height || undefined,
  entryFee: dbClassEntry.entry_fee || undefined,
  preferredJudge: dbClassEntry.preferred_judge || undefined,
  status: (dbClassEntry.status as ClassEntry['status']) || 'pending',
  notes: dbClassEntry.notes || undefined,
  qualifiedForFinals: dbClassEntry.qualified_for_finals || false,
  movedFromClassId: dbClassEntry.moved_from_class_id || undefined,
  movedToClassId: dbClassEntry.moved_to_class_id || undefined,
  createdAt: new Date(dbClassEntry.created_at!),
  updatedAt: new Date(dbClassEntry.updated_at!),
  createdBy: dbClassEntry.created_by || undefined,
  updatedBy: dbClassEntry.updated_by || undefined
});

// ============================================================================
// Entry Hooks
// ============================================================================

/**
 * Get a single entry by ID
 */
export const useEntry = (entryId: string) => {
  return useQuery({
    queryKey: ['entry', entryId],
    queryFn: async (): Promise<Entry> => {
      const { data, error } = await supabase
        .from('entry')
        .select('*')
        .eq('id', entryId)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return mapDbEntryToEntry(data);
    },
    enabled: !!entryId
  });
};

/**
 * Get an entry with all its class entries
 */
export const useEntryWithClasses = (entryId: string) => {
  return useQuery({
    queryKey: ['entry-with-classes', entryId],
    queryFn: async (): Promise<EntryWithClasses> => {
      // Get entry
      const { data: entryData, error: entryError } = await supabase
        .from('entry')
        .select('*')
        .eq('id', entryId)
        .is('deleted_at', null)
        .single();

      if (entryError) throw entryError;

      // Get class entries
      const { data: classEntriesData, error: classEntriesError } = await supabase
        .from('class_entry')
        .select('*')
        .eq('entry_id', entryId)
        .is('deleted_at', null);

      if (classEntriesError) throw classEntriesError;

      const entry = mapDbEntryToEntry(entryData);
      const classEntries = classEntriesData.map(mapDbClassEntryToClassEntry);

      return {
        ...entry,
        classEntries,
        classCount: classEntries.length,
        acceptedClasses: classEntries.filter(ce => ce.status === 'accepted').length,
        rejectedClasses: classEntries.filter(ce => ce.status === 'rejected').length,
        waitlistedClasses: classEntries.filter(ce => ce.status === 'waitlisted').length
      };
    },
    enabled: !!entryId
  });
};

/**
 * Get entries with optional filtering
 */
export const useEntries = (filters?: EntryFilters) => {
  return useQuery({
    queryKey: ['entries', filters],
    queryFn: async (): Promise<EntrySummary[]> => {
      let query = supabase
        .from('entry')
        .select(`
          *,
          dog:dog_id(name, call_name),
          handler:handler_id(first_name, last_name),
          class_entries:class_entry!entry_id(
            id,
            status,
            entry_fee
          )
        `)
        .is('deleted_at', null);

      // Apply filters
      if (filters?.showId) query = query.eq('show_id', filters.showId);
      if (filters?.handlerId) query = query.eq('handler_id', filters.handlerId);
      if (filters?.dogId) query = query.eq('dog_id', filters.dogId);
      if (filters?.entryStatus?.length) query = query.in('entry_status', filters.entryStatus);
      if (filters?.paymentStatus?.length) query = query.in('payment_status', filters.paymentStatus);
      if (filters?.submittedAfter) query = query.gte('submitted_at', filters.submittedAfter.toISOString());
      if (filters?.submittedBefore) query = query.lte('submitted_at', filters.submittedBefore.toISOString());

      const { data, error } = await query;
      if (error) throw error;

      return data.map((item): EntrySummary => {
        const classEntries = Array.isArray(item.class_entries) ? item.class_entries : [];
        return {
          id: item.id,
          dogName: (item.dog as { name?: string })?.name || 'Unknown',
          dogCallName: (item.dog as { call_name?: string })?.call_name || 'Unknown',
          handlerName: `${(item.handler as { first_name?: string })?.first_name || ''} ${(item.handler as { last_name?: string })?.last_name || ''}`.trim() || 'Unknown',
          entryStatus: (item.entry_status as EntrySummary['entryStatus']) || 'draft',
          paymentStatus: (item.payment_status as EntrySummary['paymentStatus']) || 'pending',
          totalFees: item.total_fees || 0,
          classCount: classEntries.length,
          acceptedClasses: classEntries.filter((ce: { status?: string }) => ce.status === 'accepted').length,
          rejectedClasses: classEntries.filter((ce: { status?: string }) => ce.status === 'rejected').length,
          waitlistedClasses: classEntries.filter((ce: { status?: string }) => ce.status === 'waitlisted').length,
          submittedAt: item.submitted_at ? new Date(item.submitted_at) : undefined,
          createdAt: new Date(item.created_at!)
        };
      });
    }
  });
};

/**
 * Create a new entry
 */
export const useCreateEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEntryInput): Promise<EntryWithClasses> => {
      // Start transaction-like approach by creating entry first
      const entryInsert: DbEntryInsert = {
        dog_id: input.dogId,
        handler_id: input.handlerId,
        show_id: input.showId,
        entry_status: 'draft',
        payment_status: 'pending',
        total_fees: 0,
        special_requests: input.specialRequests,
        move_up_requested: input.moveUpRequested || false
      };

      const { data: entryData, error: entryError } = await supabase
        .from('entry')
        .insert(entryInsert)
        .select()
        .single();

      if (entryError) throw entryError;

      // Create class entries
      const classEntryInserts: DbClassEntryInsert[] = input.classIds.map(classId => ({
        entry_id: entryData.id,
        class_id: classId,
        trial_id: '', // Will be auto-populated by trigger
        status: 'pending'
      }));

      const { data: classEntriesData, error: classEntriesError } = await supabase
        .from('class_entry')
        .insert(classEntryInserts)
        .select();

      if (classEntriesError) throw classEntriesError;

      const entry = mapDbEntryToEntry(entryData);
      const classEntries = classEntriesData.map(mapDbClassEntryToClassEntry);

      return {
        ...entry,
        classEntries,
        classCount: classEntries.length,
        acceptedClasses: 0,
        rejectedClasses: 0,
        waitlistedClasses: classEntries.length
      };
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['entry-with-classes', data.id] });
    }
  });
};

/**
 * Update an existing entry
 */
export const useUpdateEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ entryId, input }: { entryId: string; input: UpdateEntryInput }): Promise<Entry> => {
      const update: DbEntryUpdate = {
        special_requests: input.specialRequests,
        move_up_requested: input.moveUpRequested,
        entry_status: input.entryStatus,
        payment_status: input.paymentStatus,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('entry')
        .update(update)
        .eq('id', entryId)
        .select()
        .single();

      if (error) throw error;
      return mapDbEntryToEntry(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['entry', data.id] });
      queryClient.invalidateQueries({ queryKey: ['entry-with-classes', data.id] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    }
  });
};

// ============================================================================
// Class Entry Hooks
// ============================================================================

/**
 * Get a single class entry by ID
 */
export const useClassEntry = (classEntryId: string) => {
  return useQuery({
    queryKey: ['class-entry', classEntryId],
    queryFn: async (): Promise<ClassEntry> => {
      const { data, error } = await supabase
        .from('class_entry')
        .select('*')
        .eq('id', classEntryId)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return mapDbClassEntryToClassEntry(data);
    },
    enabled: !!classEntryId
  });
};

/**
 * Get class entries with optional filtering
 */
export const useClassEntries = (filters?: ClassEntryFilters) => {
  return useQuery({
    queryKey: ['class-entries', filters],
    queryFn: async (): Promise<ClassEntrySummary[]> => {
      let query = supabase
        .from('class_entry')
        .select(`
          *,
          entry!inner(
            dog:dog_id(name, call_name),
            handler:handler_id(first_name, last_name)
          )
        `)
        .is('deleted_at', null);

      // Apply filters
      if (filters?.entryId) query = query.eq('entry_id', filters.entryId);
      if (filters?.classId) query = query.eq('class_id', filters.classId);
      if (filters?.trialId) query = query.eq('trial_id', filters.trialId);
      if (filters?.status?.length) query = query.in('status', filters.status);
      if (filters?.hasArmband !== undefined) {
        query = filters.hasArmband 
          ? query.not('armband', 'is', null)
          : query.is('armband', null);
      }
      if (filters?.hasRunOrder !== undefined) {
        query = filters.hasRunOrder
          ? query.not('run_order', 'is', null)
          : query.is('run_order', null);
      }
      if (filters?.jumpHeight?.length) query = query.in('jump_height', filters.jumpHeight);
      if (filters?.qualifiedForFinals !== undefined) query = query.eq('qualified_for_finals', filters.qualifiedForFinals);

      const { data, error } = await query;
      if (error) throw error;

      return data.map((item): ClassEntrySummary => ({
        id: item.id,
        entryId: item.entry_id,
        dogName: (item.entry as { dog?: { name?: string } })?.dog?.name || 'Unknown',
        dogCallName: (item.entry as { dog?: { call_name?: string } })?.dog?.call_name || 'Unknown',
        handlerName: `${(item.entry as { handler?: { first_name?: string; last_name?: string } })?.handler?.first_name || ''} ${(item.entry as { handler?: { first_name?: string; last_name?: string } })?.handler?.last_name || ''}`.trim() || 'Unknown',
        armband: item.armband || undefined,
        runOrder: item.run_order || undefined,
        jumpHeight: item.jump_height || undefined,
        status: (item.status as ClassEntrySummary['status']) || 'pending',
        entryFee: item.entry_fee || undefined,
        qualifiedForFinals: item.qualified_for_finals || false
      }));
    }
  });
};

/**
 * Create a new class entry (add class to existing entry)
 */
export const useCreateClassEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateClassEntryInput): Promise<ClassEntry> => {
      const insert: DbClassEntryInsert = {
        entry_id: input.entryId,
        class_id: input.classId,
        trial_id: '', // Will be auto-populated by trigger
        jump_height: input.jumpHeight,
        preferred_judge: input.preferredJudge,
        notes: input.notes,
        status: 'pending'
      };

      const { data, error } = await supabase
        .from('class_entry')
        .insert(insert)
        .select()
        .single();

      if (error) throw error;
      return mapDbClassEntryToClassEntry(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['class-entries'] });
      queryClient.invalidateQueries({ queryKey: ['entry-with-classes', data.entryId] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    }
  });
};

/**
 * Update an existing class entry
 */
export const useUpdateClassEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ classEntryId, input }: { classEntryId: string; input: UpdateClassEntryInput }): Promise<ClassEntry> => {
      const update: DbClassEntryUpdate = {
        jump_height: input.jumpHeight,
        preferred_judge: input.preferredJudge,
        notes: input.notes,
        status: input.status,
        armband: input.armband,
        run_order: input.runOrder,
        entry_fee: input.entryFee,
        qualified_for_finals: input.qualifiedForFinals,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('class_entry')
        .update(update)
        .eq('id', classEntryId)
        .select()
        .single();

      if (error) throw error;
      return mapDbClassEntryToClassEntry(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['class-entry', data.id] });
      queryClient.invalidateQueries({ queryKey: ['class-entries'] });
      queryClient.invalidateQueries({ queryKey: ['entry-with-classes', data.entryId] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    }
  });
};

/**
 * Delete a class entry (remove class from entry)
 */
export const useDeleteClassEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (classEntryId: string): Promise<void> => {
      // Soft delete by setting deleted_at
      const { error } = await supabase
        .from('class_entry')
        .update({ 
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', classEntryId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-entries'] });
      queryClient.invalidateQueries({ queryKey: ['entry-with-classes'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    }
  });
};

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Check if a class can be added to an entry
 */
export const useCanAddClassToEntry = (entryId: string, classId: string) => {
  return useQuery({
    queryKey: ['can-add-class', entryId, classId],
    queryFn: async (): Promise<boolean> => {
      // Use client-side validation since RPC function doesn't exist
      try {
        // Client-side validation
        const [entryResult, existingResult] = await Promise.all([
          supabase
            .from('entry')
            .select('entry_status')
            .eq('id', entryId)
            .is('deleted_at', null)
            .single(),
          supabase
            .from('class_entry')
            .select('id')
            .eq('entry_id', entryId)
            .eq('class_id', classId)
            .is('deleted_at', null)
            .maybeSingle()
        ]);

        if (entryResult.error) return false;
        if (existingResult.data) return false; // Already exists
        
        const entryStatus = entryResult.data.entry_status;
        return entryStatus === 'draft' || entryStatus === 'submitted';
      } catch (error) {
        console.error('Error checking can add class to entry:', error);
        return false;
      }
    },
    enabled: !!entryId && !!classId
  });
};