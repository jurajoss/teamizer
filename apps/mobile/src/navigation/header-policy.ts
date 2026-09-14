export type AuthenticatedHeaderKind = 'home' | 'inner';

export function authenticatedHeaderTitleAlignment(
  kind: AuthenticatedHeaderKind,
): 'left' | 'center' {
  return kind === 'inner' ? 'center' : 'left';
}

export function authenticatedHeaderPolicy(kind: AuthenticatedHeaderKind) {
  return kind === 'home'
    ? {
        showAccount: true,
        showBack: false,
        showBrand: true,
        showBreadcrumb: false,
        showSignOut: false,
        showTitle: false,
      }
    : {
        showAccount: true,
        showBack: true,
        showBrand: false,
        showBreadcrumb: false,
        showSignOut: false,
        showTitle: true,
      };
}
