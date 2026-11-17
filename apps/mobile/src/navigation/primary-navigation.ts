import type { TeamizerIconName } from '../ui/icons/app-icon-map';

export type PrimaryDestinationKey = 'home' | 'matches' | 'rankings';

export type PrimaryDestination = {
  href: '/home' | '/matches' | '/rankings';
  icon: TeamizerIconName;
  key: PrimaryDestinationKey;
  labelKey: 'nav.home' | 'nav.matches' | 'nav.rankings';
};

export const primaryDestinations: readonly PrimaryDestination[] = [
  { key: 'home', href: '/home', icon: 'home', labelKey: 'nav.home' },
  {
    key: 'matches',
    href: '/matches',
    icon: 'matches',
    labelKey: 'nav.matches',
  },
  {
    key: 'rankings',
    href: '/rankings',
    icon: 'rankings',
    labelKey: 'nav.rankings',
  },
] as const;

export type ShellComposition = 'bottom-navigation' | 'sidebar';

export const authenticatedFeatureContentKey = 'authenticated-feature-content';

export type AuthenticatedShellPresentation = {
  contentKey: typeof authenticatedFeatureContentKey;
  ownership: { bottom: boolean; left: boolean };
  showBottomNavigation: boolean;
  showSidebar: boolean;
};

const noShellSafeAreaOwnership = { bottom: false, left: false };
const bottomNavigationSafeAreaOwnership = { bottom: true, left: false };
const sidebarSafeAreaOwnership = { bottom: false, left: true };

export function shellCompositionForMode(
  mode: 'phone' | 'tablet',
  primaryNavigationHidden = false,
): ShellComposition | null {
  if (primaryNavigationHidden) return null;
  return mode === 'tablet' ? 'sidebar' : 'bottom-navigation';
}

export function authenticatedShellPresentation(
  mode: 'phone' | 'tablet',
  primaryNavigationHidden = false,
): AuthenticatedShellPresentation {
  const composition = shellCompositionForMode(mode, primaryNavigationHidden);

  return {
    contentKey: authenticatedFeatureContentKey,
    ownership:
      composition === 'bottom-navigation'
        ? bottomNavigationSafeAreaOwnership
        : composition === 'sidebar'
          ? sidebarSafeAreaOwnership
          : noShellSafeAreaOwnership,
    showBottomNavigation: composition === 'bottom-navigation',
    showSidebar: composition === 'sidebar',
  };
}

export function authenticatedShellPresentationForPath(
  mode: 'phone' | 'tablet',
  pathname: string,
): AuthenticatedShellPresentation {
  return authenticatedShellPresentation(mode, !isPrimaryRootPath(pathname));
}

export function activePrimaryDestination(
  pathname: string,
): PrimaryDestinationKey | null {
  const normalized = normalizePathname(pathname);
  if (normalized === '/home') return 'home';
  if (isPathWithin(normalized, '/matches')) return 'matches';
  if (normalized === '/rankings') return 'rankings';
  return null;
}

export function initialPrimaryDestination(
  pathname: string,
): PrimaryDestinationKey {
  return (
    activePrimaryDestination(pathname) ??
    (normalizePathname(pathname).startsWith('/players/') ? 'rankings' : 'home')
  );
}

export function primaryNavigationTarget(
  pathname: string,
  destination: PrimaryDestination,
): PrimaryDestination['href'] | null {
  return normalizePathname(pathname) === destination.href
    ? null
    : destination.href;
}

export function isPrimaryRootPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return primaryDestinations.some(({ href }) => href === normalized);
}

function normalizePathname(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '');
}

function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}
