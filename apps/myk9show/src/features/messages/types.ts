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

export type MessageTargetType = 'class' | 'checked_in' | 'all_show' | 'person';

export interface MessageTarget {
  type: MessageTargetType;
  classId?: string;
  /** With type 'person': the one exhibitor (people.id) the message goes to. */
  personId?: string;
  sendPush?: boolean;
  /** Also email everyone in the audience who has an address (resolved server-side). */
  sendEmail?: boolean;
  /** Email only: the in-app copy is posted elsewhere (the show-wide announcement lane). */
  emailOnly?: boolean;
}

export interface SendTargetedMessageParams {
  showId: string;
  target: MessageTarget;
  body: string;
}
