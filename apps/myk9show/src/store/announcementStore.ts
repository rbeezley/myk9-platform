import { create } from 'zustand';
import { supabase } from '@/services/database/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  ShowAnnouncement,
  DbShowAnnouncement,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  AnnouncementAuthorRole,
} from '@/types/announcement-types';
import {
  getAnnouncementsByShow,
  createAnnouncement as createAnnouncementQuery,
  updateAnnouncement as updateAnnouncementQuery,
  deleteAnnouncement as deleteAnnouncementQuery,
  markAnnouncementRead,
  markAllAnnouncementsRead,
} from '@/services/database/announcements';
import { useToastStore } from '@/store/toastStore';
import { logger } from '@/services/LoggingService';

interface AnnouncementState {
  announcements: ShowAnnouncement[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  currentShowIds: string[];
  channels: RealtimeChannel[];

  subscribe: (showIds: string[]) => Promise<void>;
  unsubscribe: () => void;
  createAnnouncement: (
    input: CreateAnnouncementInput,
    authorId: string,
    authorRole: AnnouncementAuthorRole,
    authorName: string
  ) => Promise<void>;
  updateAnnouncement: (id: string, updates: UpdateAnnouncementInput) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  markRead: (id: string, userId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
}

function computeUnreadCount(announcements: ShowAnnouncement[]): number {
  return announcements.filter(a => !a.is_read).length;
}

export const useAnnouncementStore = create<AnnouncementState>()((set, get) => ({
  announcements: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  currentShowIds: [],
  channels: [],

  subscribe: async (showIds: string[]) => {
    const current = get();

    // Skip if already subscribed to the same shows
    const sorted = [...showIds].sort();
    const currentSorted = [...current.currentShowIds].sort();
    if (JSON.stringify(sorted) === JSON.stringify(currentSorted)) return;

    // Clean up existing channels
    current.unsubscribe();

    if (showIds.length === 0) {
      set({ currentShowIds: [], announcements: [], unreadCount: 0 });
      return;
    }

    set({ isLoading: true, error: null, currentShowIds: showIds });

    try {
      // Fetch announcements for all shows
      const results = await Promise.all(showIds.map(getAnnouncementsByShow));
      const all = results
        .flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      set({ announcements: all, unreadCount: computeUnreadCount(all), isLoading: false });

      // Set up realtime channels
      const channels: RealtimeChannel[] = [];
      for (const showId of showIds) {
        const channel = supabase
          .channel(`announcements-${showId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'show_announcements',
              filter: `show_id=eq.${showId}`,
            },
            payload => {
              const newAnn: ShowAnnouncement = {
                ...(payload.new as DbShowAnnouncement),
                is_read: false,
              };
              set(state => {
                // Dedup: skip if already present (optimistic create or duplicate event)
                if (state.announcements.some(a => a.id === newAnn.id)) return state;
                const updated = [newAnn, ...state.announcements];
                return { announcements: updated, unreadCount: computeUnreadCount(updated) };
              });

              // Trigger toast for high/urgent announcements (per spec: realtime flow step 4)
              if (newAnn.priority === 'high' || newAnn.priority === 'urgent') {
                useToastStore.getState().addToast({
                  id: `ann-${newAnn.id}`,
                  type: 'announcement',
                  title: newAnn.title,
                  body: newAnn.content,
                  priority: newAnn.priority,
                  timestamp: Date.now(),
                });
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'show_announcements',
              filter: `show_id=eq.${showId}`,
            },
            payload => {
              set(state => {
                const updated = state.announcements.map(a =>
                  a.id === (payload.new as DbShowAnnouncement).id
                    ? { ...a, ...(payload.new as DbShowAnnouncement) }
                    : a
                );
                return { announcements: updated, unreadCount: computeUnreadCount(updated) };
              });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'show_announcements',
              filter: `show_id=eq.${showId}`,
            },
            payload => {
              const deletedId = (payload.old as { id: string }).id;
              set(state => {
                const updated = state.announcements.filter(a => a.id !== deletedId);
                return { announcements: updated, unreadCount: computeUnreadCount(updated) };
              });
            }
          );

        await channel.subscribe();
        channels.push(channel);
      }

      set({ channels });
    } catch (err) {
      logger.error('Failed to subscribe to announcements:', 'announcements', { data: err });
      set({
        error: err instanceof Error ? err.message : 'Failed to load announcements',
        isLoading: false,
      });
    }
  },

  unsubscribe: () => {
    const { channels } = get();
    for (const ch of channels) {
      supabase.removeChannel(ch);
    }
    set({ channels: [], currentShowIds: [] });
  },

  createAnnouncement: async (input, authorId, authorRole, authorName) => {
    // Optimistic add
    const tempId = crypto.randomUUID();
    const optimistic: ShowAnnouncement = {
      id: tempId,
      show_id: input.show_id,
      author_id: authorId,
      author_role: authorRole,
      author_name: authorName,
      title: input.title,
      content: input.content,
      priority: input.priority,
      expires_at: input.expires_at ?? null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_read: true, // Author has already "read" their own
    };

    set(state => {
      const updated = [optimistic, ...state.announcements];
      return { announcements: updated, unreadCount: computeUnreadCount(updated) };
    });

    try {
      const created = await createAnnouncementQuery(input, authorId, authorRole, authorName);
      // Replace optimistic with real data (realtime may also fire — dedup by replacing temp)
      set(state => ({
        announcements: state.announcements.map(a =>
          a.id === tempId ? { ...created, is_read: true } : a
        ),
      }));
    } catch (err) {
      // Rollback optimistic
      set(state => {
        const updated = state.announcements.filter(a => a.id !== tempId);
        return { announcements: updated, unreadCount: computeUnreadCount(updated) };
      });
      throw err;
    }
  },

  updateAnnouncement: async (id, updates) => {
    // Optimistic update
    const prev = get().announcements.find(a => a.id === id);
    if (!prev) return;

    set(state => ({
      announcements: state.announcements.map(a => (a.id === id ? { ...a, ...updates } : a)),
    }));

    try {
      await updateAnnouncementQuery(id, updates);
    } catch (err) {
      // Rollback
      set(state => ({
        announcements: state.announcements.map(a => (a.id === id ? prev : a)),
      }));
      throw err;
    }
  },

  deleteAnnouncement: async id => {
    const prev = get().announcements;

    set(state => {
      const updated = state.announcements.filter(a => a.id !== id);
      return { announcements: updated, unreadCount: computeUnreadCount(updated) };
    });

    try {
      await deleteAnnouncementQuery(id);
    } catch (err) {
      set({ announcements: prev, unreadCount: computeUnreadCount(prev) });
      throw err;
    }
  },

  markRead: async (id, userId) => {
    set(state => {
      const updated = state.announcements.map(a => (a.id === id ? { ...a, is_read: true } : a));
      return { announcements: updated, unreadCount: computeUnreadCount(updated) };
    });

    try {
      await markAnnouncementRead(id, userId);
    } catch (err) {
      logger.error('Failed to mark announcement read:', 'announcements', { data: err });
    }
  },

  markAllRead: async userId => {
    const unreadIds = get()
      .announcements.filter(a => !a.is_read)
      .map(a => a.id);
    if (unreadIds.length === 0) return;

    set(state => ({
      announcements: state.announcements.map(a => ({ ...a, is_read: true })),
      unreadCount: 0,
    }));

    try {
      await markAllAnnouncementsRead(unreadIds, userId);
    } catch (err) {
      logger.error('Failed to mark all announcements read:', 'announcements', { data: err });
    }
  },
}));
