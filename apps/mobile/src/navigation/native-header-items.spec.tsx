import { describe, expect, it, vi } from 'vitest';

vi.mock('./account-menu', () => ({
  AccountAvatarButton: 'AccountAvatarButton',
}));

import {
  iosAccountHeaderItems,
  iosContextualHeaderItems,
  iosNestedBackItems,
  iosPlayerProfileHeaderItems,
} from './native-header-items';

describe('iOS native header items', () => {
  it('keeps Edit as the only contextual nested action', () => {
    const onEdit = vi.fn();
    const items = iosPlayerProfileHeaderItems({
      editLabel: 'Edit player profile',
      onEdit,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      accessibilityLabel: 'Edit player profile',
      icon: { name: 'pencil', type: 'sfSymbol' },
      label: 'Edit player profile',
      onPress: onEdit,
      type: 'button',
      variant: 'plain',
    });
    expect(items[0]).not.toHaveProperty('tintColor');
  });

  it('does not render account or Edit on a read-only nested profile', () => {
    expect(
      iosPlayerProfileHeaderItems({
        editLabel: 'Edit player profile',
      }),
    ).toEqual([]);
  });

  it('creates a native contextual root action without duplicating account access', () => {
    const onPress = vi.fn();
    expect(
      iosContextualHeaderItems({
        icon: 'add',
        label: 'Create match',
        onPress,
      }),
    ).toEqual([
      expect.objectContaining({
        accessibilityLabel: 'Create match',
        icon: { name: 'plus', type: 'sfSymbol' },
        onPress,
        type: 'button',
        variant: 'plain',
      }),
    ]);
    expect(
      iosContextualHeaderItems({
        icon: 'add',
        label: 'Create match',
        onPress,
      })[0],
    ).not.toHaveProperty('tintColor');
    expect(iosAccountHeaderItems()).toEqual([
      expect.objectContaining({ type: 'custom' }),
    ]);
  });

  it('uses the stack Back item when possible and a native fallback on direct entry', () => {
    const onFallback = vi.fn();

    expect(
      iosNestedBackItems({
        canGoBack: true,
        colors: { accent: 'accent' },
        label: 'Back',
        onFallback,
      }),
    ).toEqual([]);
    expect(
      iosNestedBackItems({
        canGoBack: false,
        colors: { accent: 'accent' },
        label: 'Back',
        onFallback,
      }),
    ).toEqual([
      expect.objectContaining({
        hidesSharedBackground: true,
        icon: { name: 'chevron.left', type: 'sfSymbol' },
        onPress: onFallback,
        type: 'button',
      }),
    ]);
  });
});
