import { describe, expect, it } from 'vitest';

import {
  accountMenuActionsForRole,
  accountMenuVisibility,
} from './account-menu-state';
import {
  authenticatedHeaderPolicy,
  authenticatedHeaderTitleAlignment,
} from './header-policy';

describe('authenticated navigation chrome', () => {
  it('uses a branded, account-enabled Home header without Back', () => {
    expect(authenticatedHeaderPolicy('home')).toEqual({
      showAccount: true,
      showBack: false,
      showBrand: true,
      showBreadcrumb: false,
      showSignOut: false,
      showTitle: false,
    });
  });

  it('uses Back, a concise title slot, and account access on inner screens', () => {
    expect(authenticatedHeaderPolicy('inner')).toEqual({
      showAccount: true,
      showBack: true,
      showBrand: false,
      showBreadcrumb: false,
      showSignOut: false,
      showTitle: true,
    });
  });

  it('centers inner titles in the screen-level native title slot', () => {
    expect(authenticatedHeaderTitleAlignment('inner')).toBe('center');
  });

  it('keeps Home branding in the leading slot', () => {
    expect(authenticatedHeaderTitleAlignment('home')).toBe('left');
  });

  it('opens and closes the account menu deterministically', () => {
    expect(accountMenuVisibility('closed', 'OPEN')).toBe('open');
    expect(accountMenuVisibility('open', 'CLOSE')).toBe('closed');
  });

  it('shows Administration only to admins', () => {
    expect(accountMenuActionsForRole('PLAYER')).not.toContain('administration');
    expect(accountMenuActionsForRole('ADMIN')).toContain('administration');
  });
});
