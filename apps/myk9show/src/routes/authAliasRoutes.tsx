import { Navigate, Route, useLocation } from 'react-router-dom';

/** Redirect that keeps the query string and hash (returnTo/redirectTo survive the alias). */
function RedirectKeepingSearch({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

/** MYK9-1280: /login and /signup are aliases of the real auth pages, so neither 404s. */
export function AuthAliasRoutes() {
  return (
    <>
      <Route path="/login" element={<RedirectKeepingSearch to="/sign-in" />} />
      <Route path="/signup" element={<RedirectKeepingSearch to="/sign-up" />} />
    </>
  );
}
