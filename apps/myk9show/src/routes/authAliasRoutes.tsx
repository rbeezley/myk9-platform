import { Navigate, Route } from 'react-router-dom';

/** MYK9-1280: /login and /signup are aliases of the real auth pages, so neither 404s. */
export function AuthAliasRoutes() {
  return (
    <>
      <Route path="/login" element={<Navigate to="/sign-in" replace />} />
      <Route path="/signup" element={<Navigate to="/sign-up" replace />} />
    </>
  );
}
