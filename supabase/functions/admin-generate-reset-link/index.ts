import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import {
  generateResetLinkHandler,
  type GenerateResetLinkRequest,
} from './generateResetLinkHandler.ts';

handle<GenerateResetLinkRequest>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  generateResetLinkHandler
);
