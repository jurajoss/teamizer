import type { NativeStackHeaderItem } from 'expo-router';

import { teamizerIconSymbols } from '../ui/icons/app-icon-map';
import { AccountAvatarButton } from './account-menu';

type NativeHeaderItemColors = {
  accent: string;
};

export function iosAccountHeaderItems(): NativeStackHeaderItem[] {
  return [accountItem()];
}

export function iosPlayerProfileHeaderItems({
  editLabel,
  onEdit,
}: {
  editLabel: string;
  onEdit?: () => void;
}): NativeStackHeaderItem[] {
  return iosContextualHeaderItems({
    icon: 'edit',
    label: editLabel,
    ...(onEdit ? { onPress: onEdit } : {}),
  });
}

export function iosContextualHeaderItems({
  icon,
  label,
  onPress,
}: {
  icon: 'add' | 'edit';
  label: string;
  onPress?: () => void;
}): NativeStackHeaderItem[] {
  if (!onPress) return [];

  return [
    {
      accessibilityLabel: label,
      icon: { name: teamizerIconSymbols[icon].ios, type: 'sfSymbol' },
      label,
      onPress,
      type: 'button',
      variant: 'plain',
    },
  ];
}

export function iosNestedBackItems({
  canGoBack,
  colors,
  label,
  onFallback,
}: {
  canGoBack: boolean | undefined;
  colors: NativeHeaderItemColors;
  label: string;
  onFallback(): void;
}): NativeStackHeaderItem[] {
  if (canGoBack) return [];

  return [
    {
      accessibilityLabel: label,
      hidesSharedBackground: true,
      icon: { name: teamizerIconSymbols.back.ios, type: 'sfSymbol' },
      label,
      onPress: onFallback,
      tintColor: colors.accent,
      type: 'button',
      variant: 'plain',
    },
  ];
}

function accountItem(): NativeStackHeaderItem {
  return {
    element: <AccountAvatarButton />,
    hidesSharedBackground: true,
    type: 'custom',
  };
}
