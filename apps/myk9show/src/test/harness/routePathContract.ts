export interface RoutePathContract {
  path: string;
  expectedPath?: string;
  pathMatch?: 'exact' | 'prefix';
}

export function expectedRoutePath(route: RoutePathContract): string {
  return (route.expectedPath ?? route.path).split('?')[0];
}

export function routePathMatches(route: RoutePathContract, currentPath: string): boolean {
  const expectedPath = expectedRoutePath(route);

  if (route.pathMatch === 'exact' || expectedPath === '/') {
    return currentPath === expectedPath;
  }

  return currentPath === expectedPath || currentPath.startsWith(`${expectedPath}/`);
}
