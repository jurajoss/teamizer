import { isPrimaryRootPath } from './primary-navigation';

export type AuthenticatedHeaderKind = 'primary' | 'nested';

export const homeNativeHeaderTitle = 'Teamizer';

export function authenticatedHeaderTitleAlignment(
  _kind: AuthenticatedHeaderKind,
  platform: string,
): 'center' | 'left' {
  return platform === 'android' ? 'left' : 'center';
}

export function authenticatedHeaderPolicy(kind: AuthenticatedHeaderKind) {
  return {
    showAccount: kind === 'primary',
    showBack: kind === 'nested',
    showTitle: true,
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
  | '/rankings'
  | '/admin'
  | '/admin/matches'
  | '/admin/players'
  | `/matches/${string}` {
  const matchEditor = pathname.match(
    /^\/matches\/([^/]+)\/(?:edit-participants|edit-teams)\/?$/,
  );
  if (matchEditor?.[1]) return `/matches/${matchEditor[1]}`;
  if (pathname.startsWith('/matches/')) return '/matches';
  if (pathname.startsWith('/players/')) return '/rankings';
  if (pathname.startsWith('/admin/matches/')) return '/admin/matches';
  if (pathname.startsWith('/admin/players/')) return '/admin/players';
  if (pathname === '/admin/matches' || pathname === '/admin/players') {
    return '/admin';
  }
  return '/home';
}
