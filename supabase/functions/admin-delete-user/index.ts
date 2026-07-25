// supabase/functions/admin-delete-user/index.ts
// Hard-delete a person + their auth.users entry. site_admin only.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { deleteUserHandler, type DeleteUserRequest } from './deleteUserHandler.ts';

handle<DeleteUserRequest>({ auth: 'jwt', origins: MYK9SHOW_ORIGINS }, deleteUserHandler);
