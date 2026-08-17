/**
 * Minimal ambient declarations for the Deno globals used by the edge-function
 * modules that `tsconfig.edge-tests.json` typechecks.
 *
 * Scoped deliberately: this file is included ONLY by `tsconfig.edge-tests.json`,
 * never by `tsconfig.app.json` / `tsconfig.test.json`, so browser/app code cannot
 * accidentally reach for `Deno`. It also lives outside `supabase/functions/`, so
 * the real Deno runtime (and `supabase functions deploy`) never sees it and there
 * is no conflict with Deno's own built-in `lib.deno.d.ts`.
 *
 * Keep it narrow — add a member only when a typechecked module actually uses it.
 * A missing member should surface as a compile error, not be papered over with
 * `any`.
 */
declare const Deno: {
  env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    toObject(): Record<string, string>;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};
