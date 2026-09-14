/**
 * Classifies what a registered route ACTUALLY renders, by walking the static
 * React element tree the router was built from.
 *
 * This is deliberately not a source grep. `publicRoutes.tsx` evaluates
 * `featurePage(features.x, ...)` while the JSX is constructed, so a route
 * behind a `false` flag really is a `<ComingSoonPage>` element in the tree —
 * reading the element is reading the rendered outcome, not a comment about it.
 */
import { isValidElement, type ComponentType, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { SuspenseWrapper } from '@/routes/utils/SuspenseWrapper';
import { PageTransition } from '@/components/common/PageTransition';
import { RoleSurfaceErrorBoundary } from '@/components/common/RoleSurfaceErrorBoundary';
import { ComingSoonPage } from '@/components/common/ComingSoonPage';

export type RouteSurfaceKind = 'page' | 'redirect' | 'placeholder' | 'unknown';

/**
 * Components that only wrap whatever a route renders. Recursed through; never
 * counted as the route's content.
 */
const WRAPPERS: ReadonlySet<unknown> = new Set<unknown>([
  ProtectedRoute,
  SuspenseWrapper,
  PageTransition,
  RoleSurfaceErrorBoundary,
]);

function collectContentTypes(node: ReactNode, out: unknown[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectContentTypes(child, out);
    return;
  }
  if (!isValidElement(node)) return;

  const type = node.type as ComponentType<unknown> | symbol | string;
  const props = node.props as { children?: ReactNode };

  if (type === Symbol.for('react.fragment') || WRAPPERS.has(type)) {
    collectContentTypes(props?.children, out);
    return;
  }

  out.push(type);
  collectContentTypes(props?.children, out);
}

/**
 * `page` — renders a real page component.
 * `redirect` — renders nothing but a `<Navigate>` (directly or via a small
 *   redirect component that itself returns one).
 * `placeholder` — renders nothing but the disabled-feature `<ComingSoonPage>`.
 */
/** The `to` prop of the single `<Navigate>` a redirect-only route renders. */
export function redirectTarget(element: ReactNode): string | null {
  const content: unknown[] = [];
  const elements: ReactNode[] = [];
  collectContentTypes(element, content);
  if (content.length !== 1 || content[0] !== Navigate) return null;
  collectNavigateElements(element, elements);
  const only = elements[0];
  if (!isValidElement(only)) return null;
  const to = (only.props as { to?: unknown }).to;
  return typeof to === 'string' ? to : null;
}

function collectNavigateElements(node: ReactNode, out: ReactNode[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectNavigateElements(child, out);
    return;
  }
  if (!isValidElement(node)) return;
  if (node.type === Navigate) out.push(node);
  collectNavigateElements((node.props as { children?: ReactNode })?.children, out);
}

export function routeSurfaceKind(element: ReactNode): RouteSurfaceKind {
  const content: unknown[] = [];
  collectContentTypes(element, content);
  if (content.length === 0) return 'unknown';
  if (content.every(t => t === Navigate)) return 'redirect';
  if (content.every(t => t === ComingSoonPage)) return 'placeholder';
  return 'page';
}
