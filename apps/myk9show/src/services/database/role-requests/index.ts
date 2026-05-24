import { supabase } from '../supabaseClient';
import type { Database } from '@/types/supabase';
import {
  mapDbRoleRequest,
  type ApproveRoleRequestInput,
  type DbRoleRequestRow,
  type RoleRequest,
} from './types';

export type {
  ApproveRoleRequestInput,
  DbRoleRequestRow,
  RequestedRole,
  RequestedScope,
  RoleRequest,
  RoleRequestStatus,
} from './types';
export { mapDbRoleRequest } from './types';

const ROLE_REQUEST_SELECT = `
  *,
  person:people!role_requests_person_id_fkey(first_name,last_name,email),
  club:clubs(name)
`;

export async function getAllRoleRequests(): Promise<RoleRequest[]> {
  const { data, error } = await supabase
    .from('role_requests')
    .select(ROLE_REQUEST_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as DbRoleRequestRow[]).map(mapDbRoleRequest);
}

export async function approveRoleRequest(
  requestId: string,
  input: ApproveRoleRequestInput
): Promise<void> {
  const args: Database['public']['Functions']['approve_role_request']['Args'] = {
    p_request_id: requestId,
    p_club_id: input.clubId,
    ...(input.showId != null ? { p_show_id: input.showId } : {}),
    ...(input.reviewerNote != null ? { p_reviewer_note: input.reviewerNote } : {}),
  };

  const { error } = await supabase.rpc('approve_role_request', args);

  if (error) throw error;
}

export async function denyRoleRequest(requestId: string, reviewerNote: string): Promise<void> {
  const { error } = await supabase.rpc('deny_role_request', {
    p_request_id: requestId,
    p_reviewer_note: reviewerNote,
  });

  if (error) throw error;
}
