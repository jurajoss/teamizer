import { isPrimaryRootPath } from './primary-navigation';

export type AuthenticatedHeaderKind = 'primary' | 'nested';

export function authenticatedHeaderTitleAlignment(
  _kind: AuthenticatedHeaderKind,
): 'center' {
  return 'center';
}

export function authenticatedHeaderPolicy(kind: AuthenticatedHeaderKind) {
  return {
    showAccount: true,
    showBack: kind === 'nested',
    showTitle: true,
    titleAlignment: authenticatedHeaderTitleAlignment(kind),
  };
}

export function authenticatedHeaderKind(
  pathname: string,
): AuthenticatedHeaderKind {
  return isPrimaryRootPath(pathname) ? 'primary' : 'nested';
}

export function nestedBackFallback(
  pathname: string,
):
  | '/home'
  | '/matches'
  | '/players'
  | '/admin'
  | '/admin/matches'
  | '/admin/players' {
  if (pathname.startsWith('/matches/')) return '/matches';
  if (pathname.startsWith('/players/')) return '/players';
  if (pathname.startsWith('/admin/matches/')) return '/admin/matches';
  if (pathname.startsWith('/admin/players/')) return '/admin/players';
  if (pathname === '/admin/matches' || pathname === '/admin/players') {
    return '/admin';
  }
  return '/home';
}
