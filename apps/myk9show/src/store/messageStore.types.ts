// Raw DB row shapes for tables not yet in the generated Supabase types

export interface DbMessage {
  id: string;
  show_id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  group_label: string | null;
  read_at: string | null;
  created_at: string;
}

export interface DbThread {
  id: string;
  show_id: string;
  participant_id: string;
  last_message_at: string;
  created_at: string;
}

export interface DbPerson {
  auth_user_id: string;
  first_name: string;
  last_name: string;
}

import type { MessageThread, Message } from '@/features/messages/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const initialState = {
  threads: [] as MessageThread[],
  messagesByThread: {} as Record<string, Message[]>,
  unreadCount: 0,
  isLoading: false,
  error: null as string | null,
  currentShowIds: [] as string[],
  currentUserId: null as string | null,
  channels: [] as RealtimeChannel[],
  _subscribing: false as boolean,
};
