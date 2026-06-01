export interface MessageThread {
  id: string;
  show_id: string;
  participant_id: string;
  last_message_at: string;
  created_at: string;
  // Joined fields
  participant_name?: string;
  participant_role?: string;
  show_name?: string;
  unread_count?: number;
  last_message_preview?: string;
}

export interface Message {
  id: string;
  show_id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  group_label: string | null;
  read_at: string | null;
  created_at: string;
  // Joined fields
  sender_name?: string;
  sender_role?: string;
}

export interface SendMessageParams {
  showId: string;
  threadId: string;
  body: string;
}

export type MessageTargetType = 'class' | 'checked_in' | 'all_show';

export interface MessageTarget {
  type: MessageTargetType;
  classId?: string;
  sendPush?: boolean;
}

export interface SendTargetedMessageParams {
  showId: string;
  target: MessageTarget;
  body: string;
}
