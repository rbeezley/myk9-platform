/**
 * The `user_roles` → `people` embed, named by foreign key.
 *
 * `user_roles` has two foreign keys to `people`: `user_id` (who holds the role)
 * and `granted_by` (who granted it). An unhinted `people(...)` embed is
 * therefore ambiguous, and PostgREST rejects the WHOLE request with PGRST201
 * rather than guessing (MYK9-726: support-message and chat-message pushes to
 * staff failed on live this way). Every `user_roles` → `people` embed names the
 * holder's FK. The embedded key in the response stays `people`.
 */
export const USER_ROLE_HOLDER_EMBED = 'people!user_roles_user_id_fkey';
